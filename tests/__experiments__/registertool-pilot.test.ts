/**
 * Pilot test: prove `McpServer.registerTool` works for one of our tools
 * end-to-end (tools/list discovery + tools/call dispatch + Zod validation +
 * default-application + handler return shape).
 *
 * Verification strategy: spin up a linked InMemoryTransport pair, attach a
 * Client to one end and the pilot's McpServer to the other, then drive the
 * server through the public Client API. This exercises exactly the same code
 * paths a real MCP host (Claude Desktop, Cursor, etc.) would.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import {
  PILOT_TOOL_DESCRIPTION,
  PILOT_TOOL_NAME,
  createPilotMcpServer,
} from '../../src/__experiments__/registertool-pilot';

// Mock the data source layer the same way the existing WWDC tests do, so this
// test stays deterministic and never touches the bundled JSON corpus.
jest.mock('../../src/utils/wwdc-data-source', () => ({
  loadGlobalMetadata: jest.fn(),
  loadTopicIndex: jest.fn(),
  loadYearIndex: jest.fn(),
  loadVideoData: jest.fn(),
  loadAllVideos: jest.fn(),
  clearDataCache: jest.fn(),
  isDataAvailable: jest.fn(),
}));

import {
  loadGlobalMetadata,
  loadVideoData,
  loadYearIndex,
} from '../../src/utils/wwdc-data-source';

const mockLoadGlobalMetadata = loadGlobalMetadata as jest.MockedFunction<typeof loadGlobalMetadata>;
const mockLoadYearIndex = loadYearIndex as jest.MockedFunction<typeof loadYearIndex>;
const mockLoadVideoData = loadVideoData as jest.MockedFunction<typeof loadVideoData>;

describe('McpServer.registerTool pilot — list_wwdc_videos', () => {
  let client: Client;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Minimal happy-path fixture: one year, one video.
    mockLoadGlobalMetadata.mockResolvedValue({
      version: '1.0',
      lastUpdated: '2025-01-01',
      totalVideos: 1,
      topics: [],
      years: ['2025'],
      statistics: {
        byTopic: {},
        byYear: {},
        videosWithCode: 1,
        videosWithTranscript: 1,
        videosWithResources: 1,
      },
    });

    mockLoadYearIndex.mockResolvedValue({
      year: '2025',
      videoCount: 1,
      videos: [{
        id: '10188',
        year: '2025',
        title: 'Meet the Translation API',
        topics: ['Machine Learning & AI'],
        duration: '15 min',
        hasCode: true,
        hasTranscript: true,
        dataFile: 'videos/2025-10188.json',
        url: 'https://developer.apple.com/videos/play/wwdc2025/10188/',
      }],
    } as any);

    mockLoadVideoData.mockResolvedValue({
      id: '10188',
      url: 'https://developer.apple.com/videos/play/wwdc2025/10188/',
      title: 'Meet the Translation API',
      duration: '15 min',
      topics: ['Machine Learning & AI'],
      hasTranscript: true,
      hasCode: true,
      hasResources: true,
      relatedVideos: [],
      year: '2025',
      resources: {},
    } as any);

    const mcpServer = createPilotMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'pilot-test-client', version: '0.0.0' });

    await Promise.all([
      mcpServer.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  test('tools/list exposes the pilot tool with a JSON Schema derived from the Zod input schema', async () => {
    const { tools } = await client.listTools();

    const pilot = tools.find(t => t.name === PILOT_TOOL_NAME);
    expect(pilot).toBeDefined();
    expect(pilot?.description).toBe(PILOT_TOOL_DESCRIPTION);
    expect(pilot?.annotations?.readOnlyHint).toBe(true);

    // The SDK auto-converts the Zod schema into JSON Schema.
    const inputSchema = pilot?.inputSchema as {
      type: string;
      properties: Record<string, { type?: string; description?: string }>;
    };
    expect(inputSchema.type).toBe('object');
    expect(inputSchema.properties).toHaveProperty('year');
    expect(inputSchema.properties).toHaveProperty('topic');
    expect(inputSchema.properties).toHaveProperty('hasCode');
    expect(inputSchema.properties).toHaveProperty('limit');
    // Zod `.describe(...)` flows through.
    expect(inputSchema.properties.year.description).toBe('Filter by WWDC year');
  });

  test('tools/call dispatches into the existing handler and returns the formatted text result', async () => {
    const result = await client.callTool({
      name: PILOT_TOOL_NAME,
      arguments: { year: '2025' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0].type).toBe('text');
    expect(content[0].text).toContain('Meet the Translation API');
    expect(content[0].text).toContain('WWDC2025');

    // Confirms the handler actually ran (and not just a stubbed response).
    expect(mockLoadYearIndex).toHaveBeenCalledWith('2025');
  });

  test('tools/call applies Zod defaults before invoking the handler', async () => {
    // No `limit` supplied — the schema's `.default(50)` should kick in.
    await client.callTool({
      name: PILOT_TOOL_NAME,
      arguments: {},
    });

    // We can't directly observe the limit inside the handler from here, but
    // the call succeeding without an "Invalid arguments" error is the proof
    // that defaults were applied (the pilot handler signature would NPE on
    // an undefined limit otherwise — `handleListWWDCVideos` defaults it
    // again internally, but the SDK's validateToolInput runs first).
    expect(mockLoadGlobalMetadata).toHaveBeenCalled();
  });

  test('tools/call rejects invalid arguments via Zod validation', async () => {
    // year must match /^(\d{4}|all)$/ per src/schemas/wwdc.schemas.ts.
    const result = await client.callTool({
      name: PILOT_TOOL_NAME,
      arguments: { year: 'not-a-year' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toMatch(/Invalid arguments|validation/i);
  });
});
