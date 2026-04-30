export type WikiPage = {
  slug: string;
  title: string;
  tags: string[];
  bodyMarkdown: string;
};

export const wikiPages: WikiPage[] = [
  {
    slug: 'analysis-playbook',
    title: 'Race Analysis Playbook (Rules-First)',
    tags: ['analysis', 'rules', 'evidence'],
    bodyMarkdown: `# Race Analysis Playbook (Rules-First)

This MCP server is designed to analyze races using **real data** and **real rules**:

- Use FastF1 tools for race/session data.
- Use FIA regulation tools to retrieve the relevant rule text (snippets + page numbers).
- If a rule or datapoint cannot be found, report it as unavailable instead of guessing.

## Recommended workflow

1. Get the real race result data
   - f1_get_session_results(year, eventQuery, "R")
2. If you need lap-level evidence
   - f1_get_laps(year, eventQuery, "R", driver?)
3. If you need a visual
   - f1_chart_session_results(...) or f1_chart_lap_times(...)
4. Load regulations (once per machine)
   - fia_prepare_f1_regulations(2026)
5. Find the exact rule text (always cite section + page)
   - fia_search_f1_regulations(query="...", sections=["B"])

## Good search keywords

- "Safety Car", "Virtual Safety Car", "VSC"
- "track limits", "leaving the track"
- "overtaking", "driving standards", "forcing another driver off"
- "pit lane", "pit entry", "pit exit"
`,
  },
  {
    slug: 'safety-car',
    title: 'Safety Car / VSC Quick Guide',
    tags: ['sporting', 'safety car', 'vsc'],
    bodyMarkdown: `# Safety Car / VSC Quick Guide

Use FIA Sporting Regulations (Section B) as the authority.

## What to do during analysis

1. Search the regs:
   - fia_search_f1_regulations(query="Safety Car", sections=["B"])
   - fia_search_f1_regulations(query="Virtual Safety Car", sections=["B"])
2. Pull evidence from the session:
   - f1_get_laps(...) for lap-by-lap context
   - f1_get_telemetry(...) for speed/throttle/brake evidence (use sparingly)

## Common questions to verify with rules text

- When can overtaking occur under SC/VSC?
- What delta/speed limits apply?
- What are restart procedures and infringement penalties?
`,
  },
  {
    slug: 'track-limits',
    title: 'Track Limits / Leaving the Track',
    tags: ['sporting', 'track limits', 'driving standards'],
    bodyMarkdown: `# Track Limits / Leaving the Track

Track limits decisions depend on the Sporting Regulations and event notes.

## What to do during analysis

1. Search the regs:
   - fia_search_f1_regulations(query="track limits", sections=["B"])
   - fia_search_f1_regulations(query="leaving the track", sections=["B"])
   - fia_search_f1_regulations(query="advantage", sections=["B"])
2. Pull race evidence:
   - f1_get_laps(...) and focus on lap numbers + pit/sector context
   - Use telemetry only if the question needs speed/brake evidence
`,
  },
  {
    slug: 'pit-lane',
    title: 'Pit Lane: Entry/Exit/Unsafe Release',
    tags: ['sporting', 'pit lane'],
    bodyMarkdown: `# Pit Lane: Entry/Exit/Unsafe Release

Pit lane incidents often require precise rule text and timing evidence.

## What to do during analysis

1. Search the regs:
   - fia_search_f1_regulations(query="pit lane", sections=["B"])
   - fia_search_f1_regulations(query="unsafe release", sections=["B"])
   - fia_search_f1_regulations(query="pit entry", sections=["B"])
   - fia_search_f1_regulations(query="pit exit", sections=["B"])
2. Pull lap evidence:
   - f1_get_laps(...) and check PitInTime/PitOutTime where available
`,
  },
  {
    slug: 'classification-points',
    title: 'Classification & Points (What counts as a result)',
    tags: ['classification', 'points'],
    bodyMarkdown: `# Classification & Points

For points and classification rules, use:

- FIA Sporting Regulations (Section B)
- FIA General Provisions (Section A) for points system references

## What to do during analysis

1. Search the regs:
   - fia_search_f1_regulations(query="classification", sections=["A","B"])
   - fia_search_f1_regulations(query="points", sections=["A","B"])
2. Pull the official-like result table:
   - f1_get_session_results(year, eventQuery, session)
3. Create a chart if helpful:
   - f1_chart_session_results(...)
`,
  },
  {
    slug: 'penalties-playbook',
    title: 'Penalties Playbook (How to reason and cite)',
    tags: ['penalties', 'stewards', 'procedure', 'analysis'],
    bodyMarkdown: `# Penalties Playbook (How to reason and cite)

This page helps you structure a rules-based penalty analysis without guessing.

## Recommended structure

1. Describe the question in one sentence
2. List the exact facts you will verify (time, lap, driver, position)
3. Retrieve FIA rule text (cite section + page)
4. Retrieve race evidence (FastF1)
5. Compare evidence vs rule conditions
6. State conclusion and uncertainty (if any)

## Rule lookup (always do this)

- fia_prepare_f1_regulations(2026)
- fia_search_f1_regulations(query="penalty", sections=["B"])
- fia_search_f1_regulations(query="incident", sections=["B"])
- fia_search_f1_regulations(query="driving", sections=["B"])
- fia_search_f1_regulations(query="stewards", sections=["B"])

## Evidence to pull (choose minimum necessary)

- f1_get_session_results(..., "R") for classification and points
- f1_get_laps(..., "R", driver?) for lap context
- f1_get_telemetry(..., "R", driver, lapNumber) if speed/brake is needed

## Output checklist

- Include citations: Section (A/B/...) + page number + FIA PDF URL
- Include which FastF1 tools were used and what they returned
- If facts are missing (e.g., incident timestamp), state what’s missing
`,
  },
  {
    slug: 'driving-standards-overtaking',
    title: 'Driving Standards & Overtaking',
    tags: ['overtaking', 'driving standards', 'penalties', 'sporting'],
    bodyMarkdown: `# Driving Standards & Overtaking

Most overtaking controversies require careful wording in the Sporting Regulations and context from laps/telemetry.

## Rule search keywords

- "overtaking"
- "driving standards"
- "forcing"
- "leaving the track"
- "advantage"
- "track"

Suggested searches:

- fia_search_f1_regulations(query="overtaking", sections=["B"])
- fia_search_f1_regulations(query="driving standards", sections=["B"])
- fia_search_f1_regulations(query="advantage", sections=["B"])

## Evidence to pull

- Laps: f1_get_laps(year, eventQuery, "R", driver?)
- If needed, telemetry for the key lap number(s):
  - f1_get_telemetry(year, eventQuery, "R", driver, lapNumber)

## Practical approach

- Identify the lap number where the pass happened
- Identify the corner/phase (entry/mid/exit) if possible
- Use the FIA clause conditions as the decision criteria (do not paraphrase without citations)
`,
  },
  {
    slug: 'flags-yellow-red',
    title: 'Flags: Yellow / Red Flag / Restart Basics',
    tags: ['flags', 'yellow', 'red flag', 'restart', 'sporting'],
    bodyMarkdown: `# Flags: Yellow / Red Flag / Restart Basics

Use this page to find the right FIA clauses when incidents involve yellow flags, red flags, suspended sessions, or restarts.

## Rule search keywords

- "yellow flag"
- "double waved"
- "red flag"
- "suspension"
- "resumption"
- "restart"
- "aborted"

Suggested searches:

- fia_search_f1_regulations(query="red flag", sections=["B"])
- fia_search_f1_regulations(query="suspension", sections=["B"])
- fia_search_f1_regulations(query="resumption", sections=["B"])
- fia_search_f1_regulations(query="yellow", sections=["B"])

## Evidence to pull

- f1_get_laps(...) to identify laps around the suspension/resumption
- f1_get_session_results(...) for classification impacts
`,
  },
  {
    slug: 'drs',
    title: 'DRS: Activation, Restrictions, and Evidence',
    tags: ['drs', 'overtaking', 'sporting', 'technical'],
    bodyMarkdown: `# DRS: Activation, Restrictions, and Evidence

DRS topics may span Sporting and Operational rules; for car system definitions, Technical may also matter.

## Rule search keywords

- "DRS"
- "drag reduction"
- "activation"
- "detection"
- "disabled"

Suggested searches:

- fia_search_f1_regulations(query="DRS", sections=["B","F"])

## Evidence to pull

- Telemetry for DRS state:
  - f1_get_telemetry(..., driver, lapNumber) (look for DRS column/state)
- Laps for context (which lap and stint):
  - f1_get_laps(..., driver)

## Notes

- If telemetry lacks a DRS column for a session, report it as unavailable instead of guessing.
`,
  },
  {
    slug: 'blue-flags',
    title: 'Blue Flags / Lapping / Unlapping',
    tags: ['blue flags', 'lapping', 'sporting'],
    bodyMarkdown: `# Blue Flags / Lapping / Unlapping

Blue flag and lapping rules are often misunderstood. Always cite the FIA clause.

## Rule search keywords

- "blue flag"
- "lapping"
- "unlapping"
- "leaders"

Suggested searches:

- fia_search_f1_regulations(query="blue flag", sections=["B"])
- fia_search_f1_regulations(query="lapping", sections=["B"])

## Evidence to pull

- Laps: f1_get_laps(...) for lap-by-lap position context
- Results: f1_get_session_results(...) for finishing laps and classification
`,
  },
  {
    slug: 'parc-ferme',
    title: 'Parc Fermé / Post-session Checks / DSQ (High-level)',
    tags: ['parc fermé', 'scrutineering', 'dsq', 'sporting'],
    bodyMarkdown: `# Parc Fermé / Post-session Checks / DSQ (High-level)

This page helps you find the right clauses quickly. Do not guess technical legality.

## Rule search keywords

- "parc fermé"
- "scrutineering"
- "weighing"
- "excluded"
- "disqualified"

Suggested searches:

- fia_search_f1_regulations(query="parc fermé", sections=["B"])
- fia_search_f1_regulations(query="scrutineering", sections=["B"])
- fia_search_f1_regulations(query="disqualified", sections=["A","B"])

## Evidence to pull

- Results: f1_get_session_results(...) for classification/points impact
`,
  },
  {
    slug: 'start-procedure',
    title: 'Start Procedure / Formation Lap / False Start',
    tags: ['start', 'formation lap', 'false start', 'sporting'],
    bodyMarkdown: `# Start Procedure / Formation Lap / False Start

This page guides rule lookups when incidents happen at the start.

## Rule search keywords

- "formation lap"
- "aborted start"
- "start procedure"
- "false start"
- "grid"

Suggested searches:

- fia_search_f1_regulations(query="formation lap", sections=["B"])
- fia_search_f1_regulations(query="false start", sections=["B"])
- fia_search_f1_regulations(query="grid procedure", sections=["B"])

## Evidence to pull

- Results for penalties applied (if reflected in classification)
- Laps for the first few laps context
`,
  },
  {
    slug: 'data-availability',
    title: 'Data Availability (Why some seasons/sessions fail)',
    tags: ['data', 'availability', 'fastf1'],
    bodyMarkdown: `# Data Availability (Why some seasons/sessions fail)

FastF1 can list schedules for future seasons, but it cannot return results/laps/telemetry for sessions that have not happened.

## Common reasons a tool fails

- The session is in the future (no data yet)
- F1ApiSupport is false for that event/session (limited timing/telemetry)
- Upstream API is temporarily unavailable
- Your cache directory is missing/unwritable

## How to troubleshoot

- Use f1_list_events(year) and check EventDate
- Use f1_resolve_event(year, query) to ensure event name is correct
- Try a past event first to validate setup
`,
  },
  {
    slug: 'charts-when-to-use',
    title: 'Charts (When to generate and what to show)',
    tags: ['charts', 'visualization', 'analysis'],
    bodyMarkdown: `# Charts (When to generate and what to show)

Charts are useful when the question is about patterns rather than a single number.

## Recommended use cases

- "Who scored the most points in a race?" → f1_chart_session_results(metric="points")
- "How consistent were lap times for a driver?" → f1_chart_lap_times(driver=...)

## Good practice

- Always state what session and driver(s) the chart covers
- If the chart is based on a filtered subset (topN / maxLaps), say so
`,
  },
  {
    slug: 'keywords-map',
    title: 'Regulation Search Keywords Map',
    tags: ['rules', 'search', 'fia'],
    bodyMarkdown: `# Regulation Search Keywords Map

Use this map to pick search phrases for fia_search_f1_regulations.

## Safety

- "Safety Car", "Virtual Safety Car", "VSC", "resumption", "restart"

## Driving standards

- "overtaking", "driving standards", "advantage", "leaving the track"

## Pit lane

- "pit lane", "pit entry", "pit exit", "unsafe release"

## Procedural

- "classification", "points", "disqualified", "parc fermé", "scrutineering"

## Flags

- "yellow", "red flag", "suspension", "resumption"
`,
  },
  {
    slug: 'role-steward',
    title: 'Role Profile: FIA Steward (Rules-first incident reasoning)',
    tags: ['role', 'steward', 'penalties', 'rules'],
    bodyMarkdown: `# Role Profile: FIA Steward (Rules-first incident reasoning)

## Mission

Make a decision grounded in:

- FIA Sporting Regulations (cite section + page)
- Real session evidence from FastF1 tools

## Workflow

1. Identify incident scope (drivers, lap numbers, session)
2. Retrieve the rule text
   - fia_prepare_f1_regulations(2026) (once)
   - fia_search_f1_regulations(query="...", sections=["B"])
3. Retrieve evidence
   - f1_get_laps(...) for lap context
   - f1_get_telemetry(...) only if needed
4. Apply rule conditions explicitly (do not paraphrase without citations)
5. Output decision + uncertainty

## Output template

- Facts (from tools)
- Rule citations (section + page + URL)
- Analysis (rule conditions vs facts)
- Conclusion
`,
  },
  {
    slug: 'role-strategist',
    title: 'Role Profile: Race Strategist (Tyres, pace, pit windows)',
    tags: ['role', 'strategist', 'strategy', 'tyres'],
    bodyMarkdown: `# Role Profile: Race Strategist (Tyres, pace, pit windows)

## Mission

Explain race outcomes and options using real data.

## Workflow

1. Get classification
   - f1_get_session_results(..., "R")
2. Get lap context for key drivers
   - f1_get_laps(..., "R", driver?)
3. Visuals when useful
   - f1_chart_session_results(...)
   - f1_chart_lap_times(driver=...)

## What to avoid

- Do not invent tyre stints if they are not present in lap data.
- If tyre compound/stint fields are missing, state that and proceed with what is available.
`,
  },
  {
    slug: 'role-performance-engineer',
    title: 'Role Profile: Performance Engineer (Telemetry-backed)',
    tags: ['role', 'performance', 'telemetry', 'engineer'],
    bodyMarkdown: `# Role Profile: Performance Engineer (Telemetry-backed)

## Mission

Use telemetry carefully to support claims about performance.

## Workflow

1. Identify the driver and lap(s)
2. Pull telemetry (keep it small)
   - f1_get_telemetry(sampleStep=5..20, maxRows=2000..8000)
3. Cross-check with lap times
   - f1_get_laps(driver=...)
4. Summarize evidence, not assumptions

## Notes

- Telemetry availability varies by session and year.
- If telemetry isn't available, do not guess. Use laps/results only.
`,
  },
  {
    slug: 'role-team-principal',
    title: 'Role Profile: Team Principal (High-level, evidence-led)',
    tags: ['role', 'team principal', 'management'],
    bodyMarkdown: `# Role Profile: Team Principal (High-level, evidence-led)

## Mission

Give a clear executive summary grounded in real outcomes, not rumors.

## Workflow

1. Confirm what happened
   - f1_get_session_results(..., "R")
2. If needed, compare drivers or key laps
   - f1_get_laps(...)
3. Use charts for simple storytelling
   - f1_chart_session_results(...)

## Rules-based topics

If the question is about penalties or procedure, switch to rules-first:

- Read role-steward guidance
- Use fia_search_f1_regulations and cite section + page
`,
  },
  {
    slug: 'role-driver',
    title: 'Role Profile: Driver (Explaining choices and constraints)',
    tags: ['role', 'driver', 'racecraft'],
    bodyMarkdown: `# Role Profile: Driver (Explaining choices and constraints)

## Mission

Explain decisions in plain language but keep it factual.

## Workflow

1. Confirm classification and key laps
   - f1_get_session_results(..., "R")
   - f1_get_laps(driver=...)
2. Use telemetry only if the question requires it
   - f1_get_telemetry(...)

## Notes

- Do not invent team radio or intent.
- If the data doesn’t show it, label it as speculation and avoid it when possible.
`,
  },
  {
    slug: 'role-commentator',
    title: 'Role Profile: Broadcaster (Accurate, simple, sourced)',
    tags: ['role', 'commentator', 'broadcast'],
    bodyMarkdown: `# Role Profile: Broadcaster (Accurate, simple, sourced)

## Mission

Tell the story of the race clearly, without making up details.

## Workflow

1. Get results
   - f1_get_session_results(..., "R")
2. Pull a chart when it helps the audience
   - f1_chart_session_results(...)
   - f1_chart_lap_times(...)

## Rules-based topics

If you mention rules or penalties, cite the FIA docs:

- fia_search_f1_regulations(query="...", sections=["B"])
`,
  },
];

export const wikiIndexMarkdown = `# FastF1 MCP Wiki (Rules-Focused)

This is a small rules-focused knowledge base. Each page is designed to help you **find the right FIA clauses** and **pull the right FastF1 evidence**.

Pages:

${wikiPages.map(p => `- fastf1://wiki/${p.slug} — ${p.title}`).join('\n')}
`;

export function getWikiPage(slug: string): WikiPage | undefined {
  return wikiPages.find(p => p.slug === slug);
}

export function searchWiki(query: string, maxResults: number) {
  const q = query.trim().toLowerCase();
  const hits = wikiPages
    .map(p => {
      const hay = `${p.slug}\n${p.title}\n${p.tags.join(' ')}\n${p.bodyMarkdown}`.toLowerCase();
      const score =
        (p.slug.toLowerCase().includes(q) ? 3 : 0) +
        (p.title.toLowerCase().includes(q) ? 3 : 0) +
        (p.tags.some(t => t.toLowerCase().includes(q)) ? 2 : 0) +
        (hay.includes(q) ? 1 : 0);
      return { page: p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(({ page }) => ({
      slug: page.slug,
      title: page.title,
      uri: `fastf1://wiki/${page.slug}`,
    }));

  return hits;
}
