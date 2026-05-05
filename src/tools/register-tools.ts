/**
 * Tool registration entry point for the Apple Developer Documentation MCP
 * server.
 *
 * The actual `server.registerTool(...)` calls are split into per-domain
 * modules under `./register/` so each new tool has an obvious home. This file
 * stays minimal: it composes the four domain registrations into a single
 * `registerAllTools` entry point used by `src/index.ts` and the in-memory
 * MCP test transport.
 *
 * `runSearchAppleDocs` and `runGetAppleDocContent` are re-exported from
 * `./register/_shared.js` so regression tests that import them from this
 * file's path keep working without code changes.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerSearchTools } from './register/search.js';
import { registerFrameworkTools } from './register/framework.js';
import { registerWWDCTools } from './register/wwdc.js';
import { registerDiagnosticTools } from './register/diagnostics.js';

export { runSearchAppleDocs, runGetAppleDocContent } from './register/_shared.js';

/**
 * Register every tool the apple-docs-mcp server exposes. Call this once during
 * startup, after constructing the `McpServer`.
 */
export function registerAllTools(server: McpServer): void {
  registerSearchTools(server);
  registerFrameworkTools(server);
  registerWWDCTools(server);
  registerDiagnosticTools(server);
}
