import { McpServer } from '@modelcontextprotocol/server';

import { dataDictionaryMarkdown, skillsOverviewMarkdown } from './docs.js';
import { registerFiaTools } from './tools/fiaTools.js';
import { registerFastF1Tools } from './tools/fastf1Tools.js';
import { registerMemoryTools } from './tools/memoryTools.js';
import { registerCaseTools } from './tools/caseTools.js';
import { registerEvidencePackTools } from './tools/evidencePackTools.js';
import { registerReferenceTools } from './tools/referenceTools.js';
import { registerSocialTools } from './tools/socialTools.js';
import { registerWiki } from './tools/wikiTools.js';

export function createServer() {
  const server = new McpServer(
    { name: 'fastf1-mcp-demo', version: '0.1.0' },
    {
      capabilities: { logging: {} },
      instructions:
        'Use only tool outputs as the source of truth for F1 facts. Do not invent values. If a tool call fails or returns no data, state that the requested real-world data is unavailable. For rules-based analysis, use the wiki pages (fastf1://wiki) to choose good searches, run fia_prepare_f1_regulations (once) and then fia_search_f1_regulations to find the relevant clauses and cite them (section + page + URL). For official FIA decision documents, use ref_fia_championship_documents and cite the PDF URL. For external references (Wikipedia/Wikidata), always include source URLs returned by tools. Use f1_resolve_event before requesting results, laps, or telemetry if the event input may be ambiguous. Prefer smaller maxRows and use sampleStep for telemetry.',
    }
  );

  registerFastF1Tools(server);
  registerFiaTools(server);
  registerMemoryTools(server);
  registerCaseTools(server);
  registerEvidencePackTools(server);
  registerReferenceTools(server);
  registerSocialTools(server);
  registerWiki(server);

  server.registerResource(
    'skills-overview',
    'fastf1://skills',
    {
      title: 'FastF1 MCP Skills',
      description: 'Overview of the main tools provided by this MCP server.',
      mimeType: 'text/markdown',
    },
    async uri => ({
      contents: [{ uri: uri.href, text: skillsOverviewMarkdown }],
    })
  );

  server.registerResource(
    'data-dictionary',
    'fastf1://data-dictionary',
    {
      title: 'FastF1 MCP Data Dictionary',
      description: 'Field-level guide for common outputs from FastF1 tools (results, laps, telemetry).',
      mimeType: 'text/markdown',
    },
    async uri => ({
      contents: [{ uri: uri.href, text: dataDictionaryMarkdown }],
    })
  );

  return server;
}
