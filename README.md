<img src="icon.svg" width="72" height="72" alt="dsh-zapier-mcp icon">

# dsh-zapier-mcp

**Connect your hosted [Zapier MCP](https://mcp.zapier.com/) server to DeepSeek Harness — paste one token in Settings, and every Zapier tool you selected becomes an agent tool in every session.**

**MIT** · **DSH 0.2.x** · **Node ≥ 22.19** · **No build step**

## Why

Zapier's hosted MCP server exposes the tools you pick at [mcp.zapier.com](https://mcp.zapier.com/) behind a single endpoint. Wiring that endpoint into a harness usually means editing config files and restarting, and it usually means leaving a secret lying in YAML.

This bundle does neither. It adds one row to a DSH profile, adds a **Zapier MCP** page to the harness Web UI, and stores the token where secrets belong: the profile credential store. On save it re-connects immediately and tells you what happened.

## Features

- **Hosted Zapier MCP** — connects to `https://mcp.zapier.com/api/v1/connect` with your token. No local MCP server, no bridge process.
- **Token in Settings, directly below Models** — a dedicated **Zapier MCP** page for pasting, re-checking, and removing the token.
- **Instant verification and tool refresh** — saving re-connects immediately; the page reports `Connected — N tools available` with the refreshed tool name list, or `Token rejected` with the server's message.
- **Every session, including DS Bot** — the row mounts at the harness root, so the tools are not session-scoped.
- **No build step** — plain ESM, no transpiler, no bundler; `npm test` needs no install.
- **No token in config files** — the token lives in the harness credential store under `credentialRef`; configuration carries only the reference name.

## Requirements

| Requirement | Version |
| --- | --- |
| DeepSeek Harness (DSH) | `0.2.x` — built and tested against `0.2.1-rc.2` |
| Node.js | `>= 22.19` |
| Zapier account with a hosted MCP server | [mcp.zapier.com](https://mcp.zapier.com/) |

The bundle depends on the shipped package `@deepseek-ai/dsh-mcp-client` at exactly `0.2.1-rc.2`, which performs the MCP connection and tool registration. When your harness version changes, that pin must be raised in lockstep — see [Compatibility](#compatibility).

## Installation

Install the bundle into a DSH profile with `dsh plugin`. The command forwards its remaining arguments verbatim to pnpm in the profile directory, so `add`, `remove`, and `why` are the pnpm verbs:

```text
Usage: dsh plugin [options] [args...]

manage a profile's plugins by forwarding the remaining arguments to pnpm in the
profile directory

Arguments:
  args              pnpm arguments, forwarded verbatim (add <pkg>, remove <pkg>,
                    why <pkg>, ...)

Options:
  --profile <name>  the profile whose plugins to manage (initialized on first
                    use)
  -h, --help        show this help
```

Install a local checkout:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-zapier-mcp
```

Or install straight from GitHub:

```sh
dsh plugin --profile web add https://github.com/parolkar/dsh-zapier-mcp
```

Then **enable the installed bundle** in the harness **Plugins UI**. Enabling it
applies the bundle's [`cordis.patch.yml`](cordis.patch.yml), which inserts the
one `zapier-mcp` row — that row is what mounts both halves of the plugin.

> Replace `web` with whichever profile you run (`dsh plugin --profile <name> ...`).
> `dsh plugin --help` shows the same summary; `dsh --help` lists the launcher
> flags and confirms the plugin command form.

## Getting your Zapier MCP token

1. Go to [mcp.zapier.com](https://mcp.zapier.com/) and create a server, or open
   an existing one.
2. Select the tools (Zapier actions) you want to expose to the model. Only the
   tools you select here become agent tools.
3. Copy the server's **connect URL** or token. The URL has this shape:

   ```text
   https://mcp.zapier.com/api/v1/connect?token=<USER_ZAPIER_MCP_TOKEN>
   ```

4. In the harness, open **Settings → Zapier MCP** and paste **only the token**
   — the `token` query parameter value, not the whole URL — into the token
   field, then save.

## Using it

### The Settings page

**Settings → Zapier MCP** sits directly below **Models**. It lets you:

- **Paste the token** and save it. Saving stores it in the profile credential
  store and immediately re-connects.
- **See the verification result.** On success the page shows
  `Connected — N tools available` plus the refreshed list of tool names. On
  failure it shows `Token rejected` together with the server's message — for
  example, an invalid token returns
  `Invalid OAuth token - please re-authenticate`.
- **Re-check.** Forces a fresh connection attempt and refreshes the tool list
  without changing the token.
- **Remove token.** Deletes the stored credential; the server disconnects.

The page only ever learns *whether* a token is configured. It never receives
the token value back.

### The tools

Once connected, the tools you selected in Zapier appear to the model as
ordinary agent tools named:

```text
mcp__zapier__<tool>
```

The `zapier` part is the tool-name namespace and is configurable via
`serverName`. Because the row mounts at the harness root, these tools are
available in **every session and agent, including DS Bot**.

If you change which tools are exposed on the Zapier side, use **Re-check** on
the Settings page to refresh the list; the harness does not poll Zapier on its
own.

## Configuration

All fields are optional and live in the row config:

| Field | Default | Meaning |
| --- | --- | --- |
| `serverName` | `zapier` | Tool-name namespace. Tools are registered as `mcp__<serverName>__<tool>`. |
| `endpoint` | `https://mcp.zapier.com/api/v1/connect` | Hosted Zapier MCP endpoint the token is appended to. |
| `credentialRef` | `ZAPIER_MCP_TOKEN` | Key in the profile credential store that holds the token. |
| `toolCallTimeoutMs` | `60000` | Timeout, in milliseconds, for a single tool call. |

The row also carries runtime **volatile** status fields that the plugin writes
and the Settings page displays: `status`, `toolCount`, `toolNames`, `lastError`,
`checkedAt`, and `checkNonce`. These are written into the profile's Cordis patch
by the harness settings service; you do not set them by hand.

To override a field, target the existing `zapier-mcp` row from your profile
patch. A patch entry with an `id` and no `insert` replaces that row's fields, and
`config` is replaced wholesale — restate every field you want to keep:

```yaml
# profile patch (e.g. your profile's cordis.patch.yml)
- id: zapier-mcp
  config:
    serverName: zapier
    endpoint: https://mcp.zapier.com/api/v1/connect
    credentialRef: ZAPIER_MCP_TOKEN
    toolCallTimeoutMs: 120000
```

### Compatibility

The harness decides how to compose patches; the `@deepseek-ai/dsh-mcp-client`
package does the MCP work, and this bundle pins it at exactly `0.2.1-rc.2` to
match DSH `0.2.1-rc.2`. If your DSH version differs, the symptom is usually that
the row fails to mount or the tools never register. The fix is to raise the pin
to the `@deepseek-ai/dsh-mcp-client` version shipped with your DSH release.

## How it works

The bundle is one row with two halves:

- **Host half** — [`index.js`](index.js) (with helpers in `lib/`). It reads the
  token from the credential service on each connection attempt, mounts
  `@deepseek-ai/dsh-mcp-client`, and re-connects when the credential changes or
  the page asks for a re-check. Results are published into the volatile config
  fields above.
- **Browser half** — [`client.js`](client.js). It registers the
  `settings.section` page named **Zapier MCP**, positioned directly below
  **Models**.

Both halves are mounted by the single row inserted by
[`cordis.patch.yml`](cordis.patch.yml). See the repository files for the
implementation details.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Settings page says `Token rejected` with `Invalid OAuth token - please re-authenticate` | Token is invalid, expired, or from a deleted Zapier server | Copy a fresh token from [mcp.zapier.com](https://mcp.zapier.com/) and save it again. |
| Connection returns HTTP 401 | Same as above — the endpoint rejects the credential | Re-issue the token in Zapier; re-check. |
| The page says Re-check forever and never settles | Endpoint unreachable from the harness, or the request hangs | Check network/proxy access to `mcp.zapier.com`, then Re-check. |
| Tools you just enabled in Zapier don't appear | The tool list is fetched at connect time; the harness does not poll | Use **Re-check** on the Settings page to refresh the list. |
| Offline or flaky network | No route to `mcp.zapier.com` | Restore connectivity and Re-check; tool calls will fail until then. |
| Row fails to mount or no tools ever register after a DSH upgrade | `@deepseek-ai/dsh-mcp-client` pin no longer matches your DSH version | Raise the pin to the version shipped with your DSH release and restart. |
| You want the bundle gone | — | **Remove token** on the Settings page, then remove the bundle from the profile (`dsh plugin --profile <name> remove dsh-zapier-mcp`) and disable it in the Plugins UI. |

## Security & privacy

- **The token is never written to this bundle or to the profile config file.**
  It is stored by the harness credential service in `~/.dsh/.credentials.yaml`
  (file mode `600`) under `credentialRef` (default `ZAPIER_MCP_TOKEN`).
- The Settings page only ever learns **whether** the token is configured; it
  never receives the token value.
- The row config and the profile's Cordis patch contain only the credential
  *reference name* plus the volatile runtime status fields (`status`,
  `toolCount`, `toolNames`, `lastError`, `checkedAt`, `checkNonce`), which the
  harness settings service writes back.
- The token is sent only to the configured Zapier MCP `endpoint`
  (`https://mcp.zapier.com/api/v1/connect` by default) when connecting.
- Removing the token deletes the stored credential; nothing else about your
  Zapier account is read or cached by this bundle.

## Development & tests

```sh
npm test
```

That is exactly:

```sh
node --check index.js && node --check client.js && node test/host.test.mjs && node test/client.test.mjs
```

There is no install required for the test script, and the package has no build
step. `index.js` and `client.js` are plain ESM.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and
the pull request checklist.

## License

[MIT](LICENSE) © 2026 parolkar.

Not affiliated with, endorsed by, or sponsored by Zapier. "Zapier" is a
trademark of its owner and is used here only to describe what this plugin
connects to.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
