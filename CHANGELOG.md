# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-24

### Added

- Initial public release of `dsh-zapier-mcp`, an MIT-licensed DeepSeek Harness
  bundle that connects a user's hosted Zapier MCP server to the harness.
- Host half (`index.js`): mounts `@deepseek-ai/dsh-mcp-client` at the harness
  root, reads the Zapier MCP token from the profile credential store per
  connection attempt, and registers the server's tools as `mcp__zapier__*` in
  every session, including DS Bot.
- Browser half (`client.js`): registers a **Zapier MCP** page in Settings,
  directly below Models, for pasting, re-checking, and removing the token, and
  for showing the verification result and refreshed tool list.
- Configuration fields `serverName`, `endpoint`, `credentialRef`, and
  `toolCallTimeoutMs`, plus volatile runtime status fields (`status`,
  `toolCount`, `toolNames`, `lastError`, `checkedAt`, `checkNonce`) written into
  the profile's Cordis patch by the harness settings service.
- One-row bundle patch (`cordis.patch.yml`), English and Chinese locale strings,
  and a no-install test suite (`npm test`).

### Notes

- Requires DeepSeek Harness `0.2.x` (built and tested against `0.2.1-rc.2`) and
  Node.js `>= 22.19`.
- Depends on the shipped package `@deepseek-ai/dsh-mcp-client` at exactly
  `0.2.1-rc.2`. When the harness version changes, that pin must be raised in
  lockstep (see the compatibility section of the [README](README.md)).
- The Zapier MCP token is never written to this bundle or to the profile config
  file; it is stored by the harness credential service and only its reference
  name appears in configuration.

[0.1.0]: https://github.com/parolkar/dsh-zapier-mcp/releases/tag/v0.1.0
