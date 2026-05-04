/**
 * Pilot: McpServer.registerTool feasibility for the apple-docs-mcp tool surface.
 *
 * ============================================================================
 * FEASIBILITY NOTE (kept here for proximity to the code; pasted in PR notes)
 * ============================================================================
 * Integration pattern chosen: FALLBACK (side-by-side standalone McpServer).
 *
 * Why not Pattern 1 (mix on the same Server): the SDK's McpServer calls
 * `assertCanSetRequestHandler` for both ListToolsRequestSchema and
 * CallToolRequestSchema the first time `registerTool` is invoked
 * (see node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:60-61).
 * Our production code in src/index.ts already wires both of those methods via
 * the low-level `setRequestHandler`, so any attempt to attach an McpServer to
 * the same `Server` instance throws "A request handler for tools/list already
 * exists, which would be overridden". Pattern 1 is therefore impossible
 * without first removing the existing handlers — which is out of scope for a
 * one-tool pilot.
 *
 * Why not Pattern 2 (McpServer owns dispatch + delegate to existing
 * toolHandlers for the 16 unmigrated tools): would still require either
 * removing the existing handlers (production-impacting) or registering
 * pass-through `registerTool` shims for all 17 tools, which the task's
 * anti-scope explicitly forbids.
 *
 * Implications for the full migration (item 11):
 *  - Production code change is concentrated in src/index.ts: replace `new
 *    Server(...)` + the two `setRequestHandler` calls (and the dispatch in
 *    handlers.ts) with an `McpServer` and per-tool `registerTool` calls.
 *    Estimated ~10 LOC removed in src/index.ts, ~5-15 LOC per tool added in a
 *    new registration module that imports the existing schemas + handlers.
 *  - No blockers: the existing Zod schemas in src/schemas/ are already
 *    `z.object(...)` and slot directly into `inputSchema`. Existing handler
 *    return shapes (`{ content: [{ type: 'text', text: string }] }`) match
 *    `CallToolResult` 1:1.
 *  - One adapter point: handlers.ts currently wraps `handleListWWDC*`
 *    string-returning handlers into `{ content: [...] }`. Either keep the
 *    wrap-on-the-fly (this pilot does) or push the wrap down into the WWDC
 *    handlers themselves during the full migration.
 *  - `outputSchema` / `structuredContent` is NOT worth adding now: every tool
 *    currently returns a single Markdown text blob — there is no structured
 *    payload to schema-ify. Worth a follow-up only after a tool is refactored
 *    to actually emit structured data (e.g. `list_wwdc_videos` returning
 *    `{ videos: WWDCVideoSummary[] }` instead of formatted Markdown).
 * ============================================================================
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { listWWDCVideosSchema } from '../schemas/wwdc.schemas.js';
import { handleListWWDCVideos } from '../tools/wwdc/wwdc-handlers.js';

/**
 * Pilot tool name. Kept identical to the production tool so the JSON-Schema
 * and behaviour can be diffed against the existing definition in
 * src/tools/definitions.ts.
 */
export const PILOT_TOOL_NAME = 'list_wwdc_videos';

/**
 * Pilot tool description. Sourced verbatim from src/tools/definitions.ts so
 * the migration is a pure mechanism change (no description drift).
 */
export const PILOT_TOOL_DESCRIPTION =
  'Browse WWDC session videos with full offline access to transcripts and code. ' +
  'Shows all available sessions with filtering options. Use this to discover ' +
  'WWDC content, find sessions by topic, or identify videos with code examples.';

/**
 * Build a fresh McpServer instance with the pilot tool registered through the
 * v2 `registerTool` API. Used by the pilot test and would be the seed of the
 * full migration in src/index.ts.
 */
export function createPilotMcpServer(): McpServer {
  const mcpServer = new McpServer({
    name: 'apple-docs-mcp-pilot',
    version: '0.0.0-pilot',
  });

  mcpServer.registerTool(
    PILOT_TOOL_NAME,
    {
      title: 'List WWDC Videos',
      description: PILOT_TOOL_DESCRIPTION,
      // The existing Zod schema slots directly into `inputSchema`. Zod
      // defaults (e.g. `limit: z.number().default(50)`) flow through to the
      // SDK's input validator — args are parsed and defaults applied before
      // the handler runs.
      inputSchema: listWWDCVideosSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ year, topic, hasCode, limit }): Promise<CallToolResult> => {
      const result = await handleListWWDCVideos(year, topic, hasCode, limit);
      return {
        content: [{ type: 'text', text: result }],
      };
    },
  );

  return mcpServer;
}
