export const skillsOverviewMarkdown = `# FastF1 MCP Skills

This MCP server provides tools for:

- Resolving flexible Formula1.com-style event queries (event name, country, location) to a canonical FastF1 EventName.
- Fetching session results, laps, and telemetry.
- Generating basic charts as PNG images.
- Building evidence packs that combine race data, rules snippets, and role playbooks.
- Fetching external reference summaries (with citations) for circuits and general context.
- Storing small pieces of persistent key-value memory for demos.

## Data integrity rule (no mock data)

- All F1 outputs are pulled from Fast-F1 at request time and/or its cache.
- The server does not fabricate or mock results, laps, telemetry, or charts.
- If real-world data is not available (future sessions, unsupported sessions, API downtime), tools return an error instead of guessing.

## External references rule (with citations)

- When using web sources (e.g., Wikipedia), always return the source URLs for citation.
- Do not copy large bodies of copyrighted text; prefer short snippets and direct links.

## Main tools

- f1_resolve_event(year, query)
- f1_list_events(year)
- f1_get_session_results(year, eventQuery, session)
- f1_get_laps(year, eventQuery, session, driver?)
- f1_get_telemetry(year, eventQuery, session, driver, lapNumber)
- f1_list_drivers(year, eventQuery?, session?)
- f1_list_teams(year, eventQuery?, session?)
- f1_get_event_schedule_details(year, query)
- f1_get_driver_profile(year, eventQuery, session, driver)
- f1_get_team_profile(year, eventQuery, session, team)
- f1_chart_session_results(year, eventQuery, session)
- f1_chart_lap_times(year, eventQuery, session, driver)
- f1_build_evidence_pack(year, eventQuery, session, topic)
- fia_list_f1_regulations(year)
- fia_prepare_f1_regulations(year)
- fia_search_f1_regulations(query, year?, sections?)
- wiki_search(query)

## Reference tools (with citations)

- ref_wikipedia_summary(query)
- f1_get_circuit_reference(year, eventQuery)
- ref_fia_championship_documents(season, championship, eventQuery?)

## Case library tools

- case_save(title, payload)
- case_list(prefix?)
- case_get(caseId)
- case_delete(caseId)

## Memory tools

- memory_kv_set(namespace, key, value)
- memory_kv_get(namespace, key)
- memory_kv_list(namespace, prefix?)
- memory_kv_delete(namespace, key)

## Social tools

- social_list_official_org_accounts()
- social_resolve_x_account(query)
- f1_list_x_accounts(year, eventQuery, session)
`;

export const dataDictionaryMarkdown = `# FastF1 MCP Data Dictionary

This server returns data from Fast-F1 as arrays of objects (rows). The exact columns vary by season and data availability, but the most common fields are below.

## Data integrity rule (no mock data)

- Treat tool outputs as the only source of truth.
- If a tool returns an error, it means the requested data is not available right now (future race, unsupported session, or upstream API issue).

## External references rule (with citations)

- External references (Wikipedia, official pages, etc.) are returned with URLs for citation.
- Treat external reference text as secondary context; race facts should come from FastF1 tools and rules text from FIA tools.

## Event object (from f1_resolve_event and other tool outputs)

- roundNumber: Championship round number
- eventName: Canonical event name used for FastF1 API access (recommended identifier)
- officialEventName: Full advertised event name (often contains sponsors)
- location: City/region (Formula1.com “location” style)
- country: Country
- eventDate: Event reference date (often race day)
- f1ApiSupport: Whether the official F1 API supports full timing/telemetry for this event/session

## f1_get_session_results output

Shape:
- event: Event object
- session: Session code (R, Q, FP1, FP2, FP3, S, SQ)
- results: Row array (top N limited by maxRows)

Common columns in results rows:
- Position: Finishing position (1 = winner)
- Abbreviation: Driver abbreviation (e.g., VER, HAM)
- FullName / LastName: Driver name fields
- TeamName: Team name
- GridPosition: Starting grid
- Time: Race time (string)
- Status: Classification status
- Points: Points scored (race)

## f1_list_drivers output

Shape:
- event: Event object (when eventQuery provided)
- session: Session code used to derive the list
- drivers: Row array

Common columns in driver rows (availability varies):
- DriverNumber
- Abbreviation
- FullName / FirstName / LastName / BroadcastName
- TeamName / TeamId / TeamColor
- DriverId
- HeadshotUrl

## f1_list_teams output

Shape:
- event: Event object (when eventQuery provided)
- session: Session code used to derive the list
- teams: Row array

Common columns in team rows:
- TeamName
- TeamId
- TeamColor

## f1_get_event_schedule_details output

Shape:
- event: Event object (resolved)
- schedule: Full schedule row for the event, including Location/Country, OfficialEventName, EventFormat, and session names/dates.

## f1_get_driver_profile output

Returns a markdown profile plus structured content:
- event: Event object
- session: Session code
- driver: A single driver row (from session results)

## f1_get_team_profile output

Returns a markdown profile plus structured content:
- event: Event object
- session: Session code
- team: A single team row
- drivers: Drivers belonging to the team in that session

## f1_build_evidence_pack output

Returns:
- content: a text summary and (optionally) chart images
- structuredContent: event/session/topic + FIA matches (snippets + page numbers) + relevant wiki page URIs + included FastF1 data

## ref_wikipedia_summary output

Returns:
- title, summary
- sources: URL list for citation

## f1_get_circuit_reference output

Returns:
- schedule: FastF1 schedule details (Location/Country and session timetable)
- circuit: cited circuit summary (if found)
- sources: URL list for citation

## ref_fia_championship_documents output

Returns:
- docs: list of decision document PDFs with titles + URLs (and published time when parseable)
- sources: includes the FIA championships documents page URL

## f1_list_x_accounts output

Returns:
- accounts: list of X accounts for orgs + teams + drivers, resolved via Wikidata when possible
- sources: Wikidata item URLs for citation

## f1_get_laps output

Shape:
- event: Event object
- session: Session code
- driver: Optional driver filter
- laps: Row array (limited by maxRows)

Common columns in lap rows:
- LapNumber: Lap number
- Driver: Driver identifier (often abbreviation)
- LapTime: Lap time (string)
- Sector1Time / Sector2Time / Sector3Time: Sector times (string)
- Compound: Tyre compound
- TyreLife: Laps on tyre
- Stint: Stint number
- PitInTime / PitOutTime: Pit timing (string)

## f1_get_telemetry output

Shape:
- event: Event object
- session: Session code
- driver: Driver
- lapNumber: Lap number
- sampleStep: Downsampling step
- telemetry: Row array (limited by maxRows)

Common columns in telemetry rows:
- Time: Time since start (string)
- Speed: km/h
- RPM: engine RPM
- Gear: gear number
- Throttle: throttle percentage
- Brake: brake on/off
- DRS: DRS state

## Chart tools

- f1_chart_session_results: Returns an image/png chart (points or position)
- f1_chart_lap_times: Returns an image/png chart of lap time vs lap number for a driver

## FIA documents

Use fia_list_f1_regulations to get the official FIA PDF links. These documents are copyrighted; prefer quoting only the specific relevant articles/clauses needed for analysis.

## Wiki resources

- fastf1://wiki (index)
- fastf1://wiki/{slug} (page)
`;
