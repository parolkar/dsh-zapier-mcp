/**
 * Host half of `dsh-zapier-mcp`.
 *
 * Connects the user's hosted Zapier MCP server to this Harness whenever the
 * configured credential resolves, and publishes connection state into this
 * entry's own volatile config fields so the Settings page can display it. The
 * MCP row is mounted at the Harness root, which is what makes the bridged
 * `mcp__zapier__*` tools visible to every session, including DS Bot.
 *
 * A Cordis namespace plugin (named exports, no default export).
 *
 * @module dsh-zapier-mcp
 */
import z from '@deepseek-ai/schemastery';
import {
  DEFAULT_ENDPOINT,
  TOOL_NAME_LIMIT,
  buildServerUrl,
  createConnectionManager,
  describeError,
  isRecheckTrigger,
  selectServerTools,
} from './lib/host-logic.js';

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'zapier-mcp';

/**
 * The credential seam must exist before this plugin activates: the token is
 * resolved per attempt through it and may live in the profile store or an
 * ambient environment variable.
 */
export const inject = ['credentials'];

/**
 * Config schema.
 *
 * Ordinary fields arrive as plain values; volatile fields arrive as Cordis
 * references and are written by the Host half through the Settings service so
 * the Client half can render them live. The token is deliberately absent
 * here — it belongs to the credential store, never to the profile entry.
 */
export const Config = z.object({
  serverName: z.string().default('zapier'),
  endpoint: z.string().default(DEFAULT_ENDPOINT),
  credentialRef: z.string().default('ZAPIER_MCP_TOKEN'),
  toolCallTimeoutMs: z.number().default(60000),
  // Advanced: alternate/self-hosted MCP endpoint. Volatile so an edit applies
  // to the next attempt without reloading the plugin; read per attempt below.
  endpointOverride: z.string().default('').volatile(),
  status: z.string().default('unconfigured').volatile(),
  toolCount: z.number().default(0).volatile(),
  // The Host publishes at most TOOL_NAME_LIMIT names; the schema enforces it.
  toolNames: z.array(z.string()).max(TOOL_NAME_LIMIT).default([]).volatile(),
  lastError: z.string().default('').volatile(),
  checkedAt: z.string().default('').volatile(),
  // Bumped by the Settings page to ask for a re-check.
  checkNonce: z.number().default(0).volatile(),
});

/**
 * Read one config field that may arrive plain or as a volatile reference.
 * @param {unknown} value - config entry as delivered by Cordis.
 * @param {unknown} fallback - value used when the entry is absent or null.
 * @returns {unknown} the plain value.
 */
function readPlain(value, fallback) {
  const raw = value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value;
  return raw === undefined || raw === null ? fallback : raw;
}

/**
 * Read a string config field with its default.
 * @param {unknown} value - raw config entry.
 * @param {string} fallback - default when absent or not a string.
 * @returns {string} the configured string.
 */
function readString(value, fallback) {
  const raw = readPlain(value, fallback);
  return typeof raw === 'string' ? raw : fallback;
}

/**
 * Activate the Host half.
 *
 * Explicitly `async`: Cordis treats a prototype-bearing ordinary function as a
 * constructor, whose returned promise would not count as startup work. This
 * function never throws — the Harness must boot with no token and with a broken
 * token, so every failure becomes a published `status='error'` instead.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context with the credentials service injected.
 * @param {object} config - validated {@link Config} value.
 * @returns {Promise<void>} resolves once the plugin is wired; the first probe continues in the background.
 */
export async function apply(ctx, config) {
  try {
    const serverName = readString(config.serverName, 'zapier');
    const endpoint = readString(config.endpoint, DEFAULT_ENDPOINT);
    const credentialRef = readString(config.credentialRef, 'ZAPIER_MCP_TOKEN');
    const toolCallTimeoutMs = readPlain(config.toolCallTimeoutMs, 60000);
    // Profile entry id is the namespace the Settings service knows; without a
    // Loader entry (tests, programmatic mounts) fall back to the plugin name.
    const ns = ctx.fiber.entry?.id ?? name;

    /** The child fiber currently owning the MCP connection, if any. */
    let childFiber;

    /**
     * Dispose the child fiber, if one is mounted. Idempotent: the connection
     * manager calls it defensively around failed mounts.
     */
    const unmount = async () => {
      const fiber = childFiber;
      childFiber = undefined;
      if (!fiber) return;
      try {
        await fiber.dispose();
      } catch {
        // Already disposed, or HMR raced the disposal: nothing left to release.
      }
    };

    /** The MCP client package, imported once and reused across reconnects. */
    let mcpModule;
    const loadMcpClient = async () => (mcpModule ??= await import('@deepseek-ai/dsh-mcp-client'));

    /**
     * Effective endpoint for one attempt. Read per attempt (not once at apply
     * time) because the override is volatile and may change between checks.
     */
    const resolveEndpoint = () => {
      const override = readString(config.endpointOverride, '').trim();
      return override === '' ? endpoint : override;
    };

    /**
     * Resolve the token for this attempt. Resolution is per call by contract:
     * caching it across attempts would pin a rotated or removed token.
     * @returns {Promise<string | undefined>} the token, or undefined when unconfigured.
     */
    const resolveToken = async () => {
      const resolved = await ctx.credentials.resolve(credentialRef);
      const value = typeof resolved?.value === 'string' ? resolved.value.trim() : '';
      return value === '' ? undefined : value;
    };

    /**
     * Public names of the tools this server registered on the shared registry.
     * @returns {string[]} matching `mcp__<serverName>__*` names.
     */
    const listTools = () => {
      const tools = ctx.get('tools');
      if (!tools) return [];
      const schemas = tools.schemas();
      return selectServerTools(schemas.map((schema) => schema.name), serverName);
    };

    /**
     * Publish the volatile status fields through the Settings service. The
     * service is optional and a publish must never break connection logic, so
     * both a missing service and a rejected write are swallowed here too.
     * @param {object} patch - complete volatile status patch.
     */
    const publish = async (patch) => {
      try {
        const settings = ctx.get('settings');
        if (!settings) return;
        await settings.update(ns, patch);
      } catch {
        // Settings absent, or the entry was reloaded underneath us.
      }
    };

    /**
     * Mount one MCP client child fiber for this token/endpoint and return its
     * disposer. `failOnStartupError` makes a rejected token reject this probe
     * (with the real cause) instead of leaving a silent no-op behind.
     * @param {string} token - resolved token for this attempt.
     * @param {string} effectiveEndpoint - endpoint chosen for this attempt.
     * @returns {Promise<Function>} disposer that disconnects and unregisters the tools.
     */
    const mount = async (token, effectiveEndpoint) => {
      const mcp = await loadMcpClient();
      const fiber = ctx.plugin(
        { name: mcp.name, inject: mcp.inject, Config: mcp.Config, apply: mcp.apply },
        {
          serverName,
          transport: 'streamable-http',
          url: buildServerUrl(effectiveEndpoint, token),
          toolCallTimeoutMs,
          failOnStartupError: true,
          reconnect: { enabled: true },
        },
      );
      childFiber = fiber;
      try {
        await fiber;
      } catch (error) {
        await unmount();
        throw error;
      }
      return unmount;
    };

    const manager = createConnectionManager({
      resolveToken,
      resolveEndpoint,
      mount,
      unmount,
      listTools,
      publish,
    });

    // This bundle ships its own Settings page, so disable the auto-generated
    // form for this entry. The child owns that decision for this fiber.
    ctx.inject(['settings'], (child) => {
      child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
    });

    // Effect-scoped so disposal (and HMR) removes both listeners.
    ctx.effect(() => {
      const offCredential = ctx.on('credentials/reference-updated', (ref) => {
        if (ref === credentialRef) void manager.trigger('credential');
      });
      const offVolatile = ctx.on('loader/volatile-update', (paths) => {
        // Ignoring our own status writes is what breaks the publish→recheck loop.
        if (isRecheckTrigger(paths)) void manager.trigger('recheck');
      });
      return () => {
        offCredential?.();
        offVolatile?.();
      };
    });

    ctx.effect(() => () => manager.dispose());

    // The first probe runs in the background on purpose: an unreachable or hung
    // endpoint must never block Harness boot. Tools register as soon as the
    // connect succeeds, and sessions read the registry per request.
    void manager.trigger('initial');
  } catch (error) {
    // Activation must not fail the bundle: report and stay checked-out.
    ctx.logger?.warn?.('zapier-mcp: host half could not start: %s', describeError(error));
  }
}
