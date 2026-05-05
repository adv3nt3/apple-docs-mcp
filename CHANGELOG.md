# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] — 2026-05-04

### Security

- Audited the server against the SlowMist MCP security checklist and landed every
  finding in [#1](https://github.com/adv3nt3/apple-docs-mcp/pull/1):
  - **H1** — close path-traversal in the WWDC data loader by resolving and
    re-validating every requested path against the bundled corpus root.
  - **H2** — restrict outbound fetches to `developer.apple.com` via a new
    `assertAppleDeveloperUrl()` SSRF guard, applied at every tool entry point
    that accepts a URL.
  - **H3** — stop letting unhandled rejections / exceptions kill the process;
    the stdio server now logs and stays alive so a single bad tool call cannot
    deny service to in-flight requests.
  - **M1** — sanitize all third-party text (Apple JSON / WWDC transcripts)
    before embedding into LLM-visible markdown: strip ASCII control and
    zero-width characters, cap length, and prefer code-fenced rendering.
  - **M2** — add cache-poisoning defenses: namespaced cache keys per data
    backend, schema-validate cache hits before reuse, and SHA-256-verify the
    bundled WWDC payload at startup.
  - **M3** — formalize the recursion contract on `fetchAppleDocJson` with a
    defensive clamp so out-of-range `maxDepth` callers cannot exhaust the
    stack.
  - **M4** — trim raw exception text from MCP error responses; the client now
    sees the pre-sanitized `AppError.message`, while the original error stays
    on `originalError` for stderr logging only.
  - **M5** — route every diagnostic through `src/utils/logger.ts` (stderr) so
    no log line ever lands on stdout and corrupts the MCP frame stream.
  - **L1** — clean up stale doc references and dead code.
  - **L2** — guard upstream JSON responses with a `Content-Type` check before
    parsing, preventing accidental HTML-as-JSON failures.
  - **L3** — supply-chain hardening: enable npm provenance on publish,
    deduplicate the lockfile, and SHA-256-pin the bundled WWDC archive.

### Changed

- **MCP SDK 1.x modernization** — bump `@modelcontextprotocol/sdk` from 1.15 to
  1.29 ([#3](https://github.com/adv3nt3/apple-docs-mcp/pull/3)) and migrate
  every tool to `McpServer.registerTool` ([#4](https://github.com/adv3nt3/apple-docs-mcp/pull/4)).
  All 20 tools are now registered in a single `src/tools/register-tools.ts`
  module; the previous `setRequestHandler` + `toolHandlers` dispatch table
  (~514 LOC of boilerplate) is gone, along with the per-tool wrapper methods
  on `AppleDeveloperDocsMCPServer`. JSON Schema for `tools/list` is generated
  automatically by the SDK from each tool's Zod input schema.
- **Linter modernization** — ESLint 8 → 10 with the flat-config format, plus
  `typescript-eslint` v8 and `@stylistic/eslint-plugin` for stylistic rules.
- **Toolchain refresh** — TypeScript 6, Jest 30.3, and the rest of the dev
  dependencies bumped to current latest ([#5](https://github.com/adv3nt3/apple-docs-mcp/pull/5)).
- **Logger output stream** — `src/utils/logger.ts` now writes to stderr so
  stdout stays reserved for the MCP framing protocol
  ([#2](https://github.com/adv3nt3/apple-docs-mcp/pull/2)).

### Added

- `appError(type, message, options)` factory in `src/utils/error-handler.ts` as
  the single construction primitive for `AppError` objects — replaces inline
  `{ type, message, ... }` literals so the shape stays enforced
  ([#2](https://github.com/adv3nt3/apple-docs-mcp/pull/2)).
- `assertAppleDeveloperUrl()` helper, the canonical SSRF guard, used at every
  tool entry point that accepts a URL ([#2](https://github.com/adv3nt3/apple-docs-mcp/pull/2)).
- 110 additional tests bringing total coverage from 72% to 79%, and a CI matrix
  that exercises Node 20.x and 22.x ([#5](https://github.com/adv3nt3/apple-docs-mcp/pull/5)).

### Removed

- Dead `src/tools/tools-guide.ts` module that was never wired into the dispatch
  table ([#2](https://github.com/adv3nt3/apple-docs-mcp/pull/2)).
- Legacy `setRequestHandler` dispatch, `toolHandlers` table, and per-tool
  bridge methods on the server class ([#4](https://github.com/adv3nt3/apple-docs-mcp/pull/4)).

### Notes

- Package renamed to `@adv3nt3/apple-docs-mcp` ahead of the first npm release
  ([#5](https://github.com/adv3nt3/apple-docs-mcp/pull/5)).

[Unreleased]: https://github.com/adv3nt3/apple-docs-mcp/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/adv3nt3/apple-docs-mcp/releases/tag/v1.1.0
