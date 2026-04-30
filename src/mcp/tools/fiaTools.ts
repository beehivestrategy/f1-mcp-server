import type { CallToolResult } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { FastF1WorkerClient } from '../../fastf1/workerClient.js';

type FiaF1RegDoc = {
  year: number;
  section: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  title: string;
  url: string;
};

function ok<T extends Record<string, unknown>>(summary: string, structuredContent: T): CallToolResult {
  return {
    content: [{ type: 'text', text: summary }],
    structuredContent,
  };
}

function toolError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

let worker: FastF1WorkerClient | undefined;

function getWorker() {
  if (!worker || worker.isClosed()) {
    worker = new FastF1WorkerClient();
    process.on('exit', () => worker?.close());
    process.on('SIGINT', () => worker?.close());
    process.on('SIGTERM', () => worker?.close());
  }
  return worker;
}

export function getFiaF1RegulationsDocs(year: number): FiaF1RegDoc[] {
  if (year !== 2026) {
    return [];
  }

  return [
    {
      year,
      section: 'A',
      title: 'FIA 2026 F1 Regulations - Section A [General Provisions]',
      url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_a_general_provisions_-_iss_02_-_2026-02-27.pdf',
    },
    {
      year,
      section: 'B',
      title: 'FIA 2026 F1 Regulations - Section B [Sporting]',
      url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_06_-_2026-04-28.pdf',
    },
    {
      year,
      section: 'C',
      title: 'FIA 2026 F1 Regulations - Section C [Technical]',
      url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_17_-_2026-04-28.pdf',
    },
    {
      year,
      section: 'D',
      title: 'FIA 2026 F1 Regulations - Section D [Financial - F1 Teams]',
      url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_d_financial_-_f1_teams_-_iss_06_-_2026-04-28.pdf',
    },
    {
      year,
      section: 'E',
      title: 'FIA 2026 F1 Regulations - Section E [Financial - PU Manufacturers]',
      url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_e_financial_-_pu_manufacturers_-_iss_04_-_2026-04-28.pdf',
    },
    {
      year,
      section: 'F',
      title: 'FIA 2026 F1 Regulations - Section F [Operational]',
      url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_f_operational_-_iss_07_-_2026-04-28.pdf',
    },
  ];
}

export function registerFiaTools(server: McpServer) {
  server.registerTool(
    'fia_list_f1_regulations',
    {
      title: 'List FIA F1 Regulations',
      description:
        'Returns official FIA PDF links for the FIA Formula One World Championship regulations. Use these as the authoritative reference when analyzing results and decisions.',
      inputSchema: z.object({
        year: z.number().int().min(1950).default(2026),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ year }): Promise<CallToolResult> => {
      const docs = getFiaF1RegulationsDocs(year);
      if (!docs.length) {
        return ok(`No preconfigured FIA documents for year ${year}.`, { year, docs: [] });
      }

      return ok(`FIA F1 regulations PDF links for ${year}.`, {
        year,
        docs,
        source: 'https://www.fia.com/regulation/category/110',
      });
    }
  );

  server.registerTool(
    'fia_prepare_f1_regulations',
    {
      title: 'Prepare FIA F1 Regulations',
      description:
        'Downloads official FIA regulation PDFs to local storage so they can be searched. Run this once before searching.',
      inputSchema: z.object({
        year: z.number().int().min(1950).default(2026),
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ year }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('fia_prepare_regulations', { year });
        return ok(`Prepared FIA regulations for ${year}.`, result);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'fia_search_f1_regulations',
    {
      title: 'Search FIA F1 Regulations',
      description:
        'Searches downloaded FIA regulation PDFs and returns short snippets with page numbers and source URLs. Use this to ground race analysis in real rule text.',
      inputSchema: z.object({
        year: z.number().int().min(1950).default(2026),
        query: z.string().min(2),
        sections: z.array(z.enum(['A', 'B', 'C', 'D', 'E', 'F'])).optional(),
        maxResults: z.number().int().min(1).max(20).default(6),
        maxChars: z.number().int().min(200).max(2000).default(900),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ year, query, sections, maxResults, maxChars }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('fia_search_regulations', {
          year,
          query,
          sections,
          maxResults,
          maxChars,
        });
        return ok(`Found FIA regulation matches for "${query}".`, result);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
