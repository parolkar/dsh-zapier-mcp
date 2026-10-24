# Contributing

Thanks for taking a look at `dsh-zapier-mcp`. This is a small, dependency-light
bundle and contributions are welcome — bug reports, locale strings, docs fixes,
and focused pull requests.

## Development setup

There is no build step and no install required just to run the tests: the test
script shells out to `node --check` and two plain Node test files.

- Node.js `>= 22.19` is required.
- To work on the Host half (`index.js`, `lib/host-logic.js`) or the browser half
  (`client.js`) against a live harness, install the bundle into a throwaway DSH
  profile:

  ```sh
  dsh plugin --profile <name> add /absolute/path/to/dsh-zapier-mcp
  ```

  `dsh plugin` forwards its remaining arguments verbatim to pnpm in the profile
  directory. Run `dsh plugin --help` for the exact list.

## Tests

```sh
npm test
```

This runs:

```sh
node --check index.js && node --check client.js && node test/host.test.mjs && node test/client.test.mjs
```

Please run `npm test` before opening a pull request, and keep it passing.

## Code style

- Plain ESM (`import` / `export`), no transpiler, no build step, no bundler.
- JSDoc on exported functions and non-obvious logic.
- Keep the surface small: prefer a few focused files over new abstractions.
- **Keep the token out of `Config`.** The Zapier MCP token must only ever be
  read from, and written to, the harness credential store. Configuration rows
  and the profile's `cordis.patch.yml` may contain the credential *reference
  name* (`credentialRef`, default `ZAPIER_MCP_TOKEN`) and the volatile status
  fields — never the token value itself.
- Never log the token, never echo it into a status field, and never send it to
  the Settings page.

## Pull request checklist

- [ ] `npm test` passes.
- [ ] No token, secret, or credential value appears in any file, log line, or
      status field.
- [ ] New or changed configuration fields are documented in `README.md` with
      their defaults.
- [ ] Any change to the `@deepseek-ai/dsh-mcp-client` version pin states the DSH
      version it was tested against, and `package.json` `engines` / `dsh.compatibility`
      are updated consistently.
- [ ] User-visible strings are added to the locale files rather than hardcoded.
- [ ] `CHANGELOG.md` has an entry under an appropriate heading.

## License and contributions

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE) that covers this project. There is no CLA and no
copyright assignment: keep your commits and open a pull request.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you shall be licensed as above, without any
additional terms or conditions.
