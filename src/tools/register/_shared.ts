/**
 * Shared helpers for the per-domain tool registration modules.
 *
 * Extracted from `register-tools.ts` so each domain file (search, framework,
 * wwdc, diagnostics) can wrap its handlers in the same MCP CallToolResult
 * shape and AppError-aware error response without duplicating the boilerplate.
 *
 * `runSearchAppleDocs` and `runGetAppleDocContent` are exported (and
 * re-exported by `register-tools.ts`) so regression tests can drive them
 * directly without spinning up a full `McpServer` + transport.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { parseSearchResults } from '../search-parser.js';
import { fetchAppleDocJson } from '../doc-fetcher.js';

import { APPLE_URLS, RECURSION_LIMITS } from '../../utils/constants.js';
import { httpClient } from '../../utils/http-client.js';
import { isValidAppleDeveloperUrl } from '../../utils/url-converter.js';
import {
  appError,
  createStandardErrorResponse,
  createToolErrorResponse,
  ErrorType,
  validateInput,
  type AppError,
} from '../../utils/error-handler.js';
import { logger } from '../../utils/logger.js';

/**
 * Wrap a string-returning operation in the standard MCP CallToolResult shape,
 * routing AppError-shaped failures through `createToolErrorResponse` so each
 * tool keeps its tool-specific suggestion text.
 *
 * The error-handler helpers return the local `ErrorResponse` interface, which
 * is structurally compatible with `CallToolResult` but lacks the index
 * signature `CallToolResult` carries — cast through `unknown` to bridge the
 * two without weakening either type elsewhere.
 */
export async function runStringOperation(
  operation: () => Promise<string>,
  toolName: string,
): Promise<CallToolResult> {
  try {
    const result = await operation();
    return {
      content: [{ type: 'text' as const, text: result }],
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'type' in error) {
      return createToolErrorResponse(error as AppError, toolName) as unknown as CallToolResult;
    }
    return createStandardErrorResponse(error, toolName) as unknown as CallToolResult;
  }
}

/**
 * Search Apple Developer Documentation. Preserves the input validation +
 * upstream-fetch + parser flow that previously lived as a wrapper method on
 * `AppleDeveloperDocsMCPServer.searchAppleDocs`.
 *
 * Exported so regression tests can drive it directly without spinning up a
 * full `McpServer` + transport.
 */
export async function runSearchAppleDocs(
  query: string,
  type: string = 'all',
): Promise<CallToolResult> {
  try {
    const queryValidation = validateInput(query, 'Search query');
    if (queryValidation) {
      return createToolErrorResponse(queryValidation, 'search_apple_docs') as unknown as CallToolResult;
    }

    const searchUrl = `${APPLE_URLS.SEARCH}?q=${encodeURIComponent(query)}`;
    logger.info(`Searching Apple docs for: ${query}`);

    const html = await httpClient.getText(searchUrl);
    return parseSearchResults(html, query, searchUrl, type) as unknown as CallToolResult;
  } catch (error) {
    if (error && typeof error === 'object' && 'type' in error) {
      return createToolErrorResponse(error as AppError, 'search_apple_docs') as unknown as CallToolResult;
    }
    return createStandardErrorResponse(error, 'search_apple_docs') as unknown as CallToolResult;
  }
}

/**
 * Fetch and format a single Apple Developer Documentation page. Preserves the
 * URL validation + recursion-depth guarantees that previously lived as a
 * wrapper method on `AppleDeveloperDocsMCPServer.getAppleDocContent`.
 *
 * Exported so the regression test for nested-response output can call it
 * directly (it asserts that `fetchAppleDocJson`'s already-MCP-shaped return
 * value is not double-wrapped).
 */
export async function runGetAppleDocContent(
  url: string,
  includeRelatedApis: boolean = false,
  includeReferences: boolean = false,
  includeSimilarApis: boolean = false,
  includePlatformAnalysis: boolean = false,
): Promise<CallToolResult> {
  try {
    const urlValidation = validateInput(url, 'URL');
    if (urlValidation) {
      return createToolErrorResponse(urlValidation, 'get_apple_doc_content') as unknown as CallToolResult;
    }

    if (!isValidAppleDeveloperUrl(url)) {
      return createToolErrorResponse(
        appError(ErrorType.INVALID_INPUT, 'URL must be from developer.apple.com'),
        'get_apple_doc_content',
      ) as unknown as CallToolResult;
    }

    // fetchAppleDocJson already returns the MCP CallToolResult shape, so
    // return it unwrapped (re-wrapping would nest the `content` field — see
    // tests/regression/get-apple-doc-content-nesting.test.ts).
    return await fetchAppleDocJson(
      url,
      {
        includeRelatedApis,
        includeReferences,
        includeSimilarApis,
        includePlatformAnalysis,
      },
      RECURSION_LIMITS.MAX_DOC_FETCH_DEPTH,
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'type' in error) {
      return createToolErrorResponse(error as AppError, 'get_apple_doc_content') as unknown as CallToolResult;
    }
    return createStandardErrorResponse(error, 'get_apple_doc_content') as unknown as CallToolResult;
  }
}
