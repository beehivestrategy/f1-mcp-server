import base64
import json
import io
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any, Literal
from urllib.parse import urlparse

import fastf1
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import fitz
import requests

CACHE_DIR = os.environ.get("FASTF1_CACHE_DIR", ".fastf1-cache")
os.makedirs(CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)

REGS_DIR = os.environ.get("FIA_REGS_DIR", "./fia-regulations")

FIA_2026_DOCS = [
    {
        "year": 2026,
        "section": "A",
        "title": "FIA 2026 F1 Regulations - Section A [General Provisions]",
        "url": "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_a_general_provisions_-_iss_02_-_2026-02-27.pdf",
    },
    {
        "year": 2026,
        "section": "B",
        "title": "FIA 2026 F1 Regulations - Section B [Sporting]",
        "url": "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_06_-_2026-04-28.pdf",
    },
    {
        "year": 2026,
        "section": "C",
        "title": "FIA 2026 F1 Regulations - Section C [Technical]",
        "url": "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_17_-_2026-04-28.pdf",
    },
    {
        "year": 2026,
        "section": "D",
        "title": "FIA 2026 F1 Regulations - Section D [Financial - F1 Teams]",
        "url": "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_d_financial_-_f1_teams_-_iss_06_-_2026-04-28.pdf",
    },
    {
        "year": 2026,
        "section": "E",
        "title": "FIA 2026 F1 Regulations - Section E [Financial - PU Manufacturers]",
        "url": "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_e_financial_-_pu_manufacturers_-_iss_04_-_2026-04-28.pdf",
    },
    {
        "year": 2026,
        "section": "F",
        "title": "FIA 2026 F1 Regulations - Section F [Operational]",
        "url": "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_f_operational_-_iss_07_-_2026-04-28.pdf",
    },
]


def list_fia_docs(year: int) -> list[dict[str, Any]]:
    if year == 2026:
        return FIA_2026_DOCS
    return []


def safe_filename_from_url(url: str) -> str:
    parsed = urlparse(url)
    base = os.path.basename(parsed.path)
    if base.lower().endswith(".pdf"):
        return base
    return f"{base}.pdf"


def ensure_fia_docs_downloaded(year: int) -> list[dict[str, Any]]:
    docs = list_fia_docs(year)
    if not docs:
        raise ValueError(f"No FIA documents configured for year {year}")

    year_dir = os.path.join(REGS_DIR, str(year))
    os.makedirs(year_dir, exist_ok=True)

    out: list[dict[str, Any]] = []
    for d in docs:
        url = str(d["url"])
        filename = safe_filename_from_url(url)
        path = os.path.join(year_dir, filename)
        if not os.path.exists(path) or os.path.getsize(path) < 1024:
            r = requests.get(url, stream=True, timeout=60)
            r.raise_for_status()
            tmp = f"{path}.tmp"
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 128):
                    if chunk:
                        f.write(chunk)
            os.replace(tmp, path)
        out.append({**d, "localPath": path})
    return out


def clean_text(s: str) -> str:
    s = s.replace("\x00", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def find_snippet(text: str, query: str, window: int = 450) -> str:
    t = text
    q = query
    idx = t.casefold().find(q.casefold())
    if idx == -1:
        return t[: min(len(t), window * 2)]
    start = max(0, idx - window)
    end = min(len(t), idx + len(q) + window)
    return t[start:end]


def search_fia_regulations(
    *,
    year: int,
    query: str,
    sections: list[str] | None,
    max_results: int,
    max_chars: int,
) -> dict[str, Any]:
    docs = ensure_fia_docs_downloaded(year)
    if sections:
        sections_set = {s.upper() for s in sections}
        docs = [d for d in docs if str(d["section"]).upper() in sections_set]

    results: list[dict[str, Any]] = []
    q = query.strip()
    for d in docs:
        path = str(d["localPath"])
        doc = fitz.open(path)
        try:
            for page_index in range(doc.page_count):
                if len(results) >= max_results:
                    break
                page = doc.load_page(page_index)
                txt = clean_text(page.get_text("text"))
                if not txt:
                    continue
                if q.casefold() not in txt.casefold():
                    continue
                snippet = find_snippet(txt, q)
                if len(snippet) > max_chars:
                    snippet = snippet[:max_chars]
                results.append(
                    {
                        "year": year,
                        "section": d["section"],
                        "title": d["title"],
                        "url": d["url"],
                        "localPath": path,
                        "page": page_index + 1,
                        "snippet": snippet,
                    }
                )
        finally:
            doc.close()

    return {"year": year, "query": query, "results": results, "count": len(results)}


def _to_jsonable_value(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, (pd.Timestamp, datetime)):
        return v.isoformat()
    if isinstance(v, pd.Timedelta):
        return str(v)
    if hasattr(v, "item"):
        try:
            return v.item()
        except Exception:
            pass
    return str(v)


def df_to_records(df: pd.DataFrame, max_rows: int | None) -> list[dict[str, Any]]:
    if max_rows is not None:
        df = df.head(max_rows)
    records: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec: dict[str, Any] = {}
        for k, v in row.to_dict().items():
            rec[str(k)] = _to_jsonable_value(v)
        records.append(rec)
    return records


def normalize_query(s: str) -> str:
    s = s.casefold()
    s = re.sub(r"[^a-z0-9\s]+", " ", s)
    s = re.sub(r"\b(formula\s*1|grand\s*prix|gp)\b", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def score_match(query_norm: str, candidate: str) -> float:
    cand_norm = normalize_query(candidate)
    if not cand_norm:
        return 0.0
    if cand_norm == query_norm:
        return 100.0
    if query_norm in cand_norm or cand_norm in query_norm:
        return 70.0 + 30.0 * SequenceMatcher(None, query_norm, cand_norm).ratio()
    return 50.0 * SequenceMatcher(None, query_norm, cand_norm).ratio()


_schedule_cache: dict[tuple[int, bool], pd.DataFrame] = {}


def get_schedule(year: int, include_testing: bool) -> pd.DataFrame:
    key = (year, include_testing)
    cached = _schedule_cache.get(key)
    if cached is not None:
        return cached
    schedule = fastf1.get_event_schedule(year, include_testing=include_testing)
    _schedule_cache[key] = schedule
    return schedule


def resolve_event(
    *,
    year: int,
    query: str,
    include_testing: bool = False,
    prefer: Literal["event", "location", "country"] | None = None,
    max_candidates: int = 5,
) -> dict[str, Any]:
    schedule = get_schedule(year, include_testing)
    query_norm = normalize_query(query)

    candidates: list[dict[str, Any]] = []
    for _, ev in schedule.iterrows():
        event_name = str(ev.get("EventName", "") or "")
        official_name = str(ev.get("OfficialEventName", "") or "")
        location = str(ev.get("Location", "") or "")
        country = str(ev.get("Country", "") or "")

        scores: dict[str, float] = {
            "event": score_match(query_norm, event_name),
            "official": score_match(query_norm, official_name),
            "location": score_match(query_norm, location),
            "country": score_match(query_norm, country),
        }

        base = max(scores.values())
        if prefer and prefer in scores:
            base = max(base, scores[prefer] + 5.0)

        if base <= 5.0:
            continue

        candidates.append(
            {
                "score": round(base, 3),
                "roundNumber": _to_jsonable_value(ev.get("RoundNumber")),
                "eventName": event_name,
                "officialEventName": official_name,
                "location": location,
                "country": country,
                "eventDate": _to_jsonable_value(ev.get("EventDate")),
                "f1ApiSupport": bool(ev.get("F1ApiSupport", False)),
            }
        )

    candidates.sort(key=lambda c: float(c["score"]), reverse=True)
    candidates = candidates[: max_candidates]

    if not candidates:
        return {"matchType": "none", "query": query, "year": year, "candidates": []}

    if len(candidates) == 1:
        return {"matchType": "unique", "query": query, "year": year, "event": candidates[0]}

    best = float(candidates[0]["score"])
    second = float(candidates[1]["score"])
    if best >= 85.0 and (best - second) >= 8.0:
        return {"matchType": "unique", "query": query, "year": year, "event": candidates[0]}

    return {"matchType": "ambiguous", "query": query, "year": year, "candidates": candidates}


@dataclass
class CachedSession:
    session: Any
    loaded_results: bool = False
    loaded_laps: bool = False
    loaded_telemetry: bool = False


_session_cache: dict[tuple[int, str, str], CachedSession] = {}


def get_cached_session(year: int, event_name: str, session_code: str) -> CachedSession:
    key = (year, event_name, session_code)
    cached = _session_cache.get(key)
    if cached is not None:
        return cached
    sess = fastf1.get_session(year, event_name, session_code)
    cached = CachedSession(session=sess)
    _session_cache[key] = cached
    return cached


def ensure_loaded(cs: CachedSession, *, results: bool, laps: bool, telemetry: bool):
    to_load_results = results and not cs.loaded_results
    to_load_laps = laps and not cs.loaded_laps
    to_load_telemetry = telemetry and not cs.loaded_telemetry

    if not (to_load_results or to_load_laps or to_load_telemetry):
        return

    cs.session.load(laps=to_load_laps or to_load_telemetry, telemetry=to_load_telemetry)
    if to_load_results:
        cs.loaded_results = True
    if to_load_laps:
        cs.loaded_laps = True
    if to_load_telemetry:
        cs.loaded_telemetry = True


def fig_to_png_base64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def handle(method: str, params: dict[str, Any]) -> dict[str, Any]:
    if method == "fia_prepare_regulations":
        year = int(params.get("year", 2026))
        docs = ensure_fia_docs_downloaded(year)
        return {"year": year, "docs": docs}

    if method == "fia_search_regulations":
        year = int(params.get("year", 2026))
        query = str(params["query"])
        sections = params.get("sections")
        if sections is not None and not isinstance(sections, list):
            raise ValueError("sections must be a list of section letters")
        max_results = int(params.get("maxResults", 6))
        max_chars = int(params.get("maxChars", 900))
        return search_fia_regulations(
            year=year,
            query=query,
            sections=sections,
            max_results=max_results,
            max_chars=max_chars,
        )

    if method == "resolve_event":
        return resolve_event(
            year=int(params["year"]),
            query=str(params["query"]),
            include_testing=bool(params.get("includeTesting", False)),
            prefer=params.get("prefer"),
            max_candidates=int(params.get("maxCandidates", 5)),
        )

    if method == "list_events":
        year = int(params["year"])
        include_testing = bool(params.get("includeTesting", False))
        max_rows = int(params.get("maxRows", 50))
        schedule = get_schedule(year, include_testing)
        rows = df_to_records(
            schedule[
                ["RoundNumber", "Country", "Location", "EventName", "OfficialEventName", "EventDate", "F1ApiSupport"]
            ],
            max_rows=max_rows,
        )
        return {"year": year, "events": rows}

    if method == "get_event_schedule_details":
        year = int(params["year"])
        query = str(params["query"])
        include_testing = bool(params.get("includeTesting", False))
        resolved = resolve_event(year=year, query=query, include_testing=include_testing, max_candidates=5)
        if resolved["matchType"] != "unique":
            raise ValueError(json.dumps({"error": "event_not_unique", "resolution": resolved}))

        schedule = get_schedule(year, include_testing)
        event_name = str(resolved["event"]["eventName"])
        rows = schedule[schedule["EventName"] == event_name]
        if rows.empty:
            raise ValueError(f"Event not found in schedule: {event_name}")
        row = rows.iloc[0].to_dict()
        return {
            "event": resolved["event"],
            "schedule": {str(k): _to_jsonable_value(v) for k, v in row.items()},
        }

    if method in ("list_drivers", "list_teams"):
        year = int(params["year"])
        event_query = params.get("eventQuery")
        session_code = str(params.get("session", "R"))
        max_rows = int(params.get("maxRows", 50))

        if event_query:
            resolved = resolve_event(year=year, query=str(event_query), max_candidates=5)
            if resolved["matchType"] != "unique":
                raise ValueError(json.dumps({"error": "event_not_unique", "resolution": resolved}))
            event_name = str(resolved["event"]["eventName"])
        else:
            schedule = get_schedule(year, include_testing=False)
            if schedule.empty:
                raise ValueError(f"No schedule available for year {year}")
            event_name = str(schedule.iloc[0]["EventName"])
            resolved = {"event": {"eventName": event_name}, "matchType": "unique", "year": year, "query": event_name}

        cs = get_cached_session(year, event_name, session_code)
        ensure_loaded(cs, results=True, laps=False, telemetry=False)
        df = cs.session.results
        if df is None or df.empty:
            raise ValueError("No session results available to derive drivers/teams")

        if method == "list_teams":
            cols = [c for c in ["TeamName", "TeamId", "TeamColor"] if c in df.columns]
            teams_df = df[cols].dropna().drop_duplicates()
            return {
                "event": resolved.get("event"),
                "session": session_code,
                "teams": df_to_records(teams_df, max_rows=max_rows),
            }

        driver_cols = [
            c
            for c in [
                "DriverNumber",
                "Abbreviation",
                "FirstName",
                "LastName",
                "FullName",
                "BroadcastName",
                "DriverId",
                "TeamName",
                "TeamId",
                "TeamColor",
                "HeadshotUrl",
                "CountryCode",
            ]
            if c in df.columns
        ]
        drivers_df = df[driver_cols].dropna(subset=[driver_cols[0]] if driver_cols else None).drop_duplicates()
        return {
            "event": resolved.get("event"),
            "session": session_code,
            "drivers": df_to_records(drivers_df, max_rows=max_rows),
        }

    if method == "chart_session_results":
        year = int(params["year"])
        event_query = str(params["eventQuery"])
        session_code = str(params["session"])
        metric = str(params.get("metric", "points")).casefold()
        top_n = int(params.get("topN", 10))

        resolved = resolve_event(year=year, query=event_query, max_candidates=5)
        if resolved["matchType"] != "unique":
            raise ValueError(json.dumps({"error": "event_not_unique", "resolution": resolved}))

        event_name = str(resolved["event"]["eventName"])
        cs = get_cached_session(year, event_name, session_code)
        ensure_loaded(cs, results=True, laps=False, telemetry=False)

        df = cs.session.results.copy()
        if df is None or df.empty:
            raise ValueError("No results available for this session")

        label_col = None
        for col in ["Abbreviation", "LastName", "FullName", "BroadcastName", "DriverNumber"]:
            if col in df.columns:
                label_col = col
                break
        if label_col is None:
            label_col = df.columns[0]

        if metric == "position":
            value_col = "Position" if "Position" in df.columns else "GridPosition"
            if value_col not in df.columns:
                raise ValueError("No position column available in results")
            df = df.sort_values(by=value_col, ascending=True).head(top_n)
            labels = [str(x) for x in df[label_col].tolist()]
            values = [float(x) for x in df[value_col].tolist()]
            fig, ax = plt.subplots(figsize=(8, max(3.5, 0.35 * len(labels) + 1.5)))
            ax.barh(labels, values, color="#E10600")
            ax.invert_yaxis()
            ax.invert_xaxis()
            ax.set_xlabel("Position (lower is better)")
            title = f"{year} {event_name} {session_code} - Position (Top {len(labels)})"
            ax.set_title(title)
        else:
            value_col = "Points" if "Points" in df.columns else "Position"
            if value_col not in df.columns:
                raise ValueError("No points/position column available in results")
            if value_col == "Points":
                df = df.sort_values(by=value_col, ascending=False).head(top_n)
            else:
                df = df.sort_values(by=value_col, ascending=True).head(top_n)
            labels = [str(x) for x in df[label_col].tolist()]
            values = [float(x) for x in df[value_col].tolist()]
            fig, ax = plt.subplots(figsize=(10, 4.8))
            ax.bar(labels, values, color="#E10600")
            ax.set_ylabel(value_col)
            ax.set_title(f"{year} {event_name} {session_code} - {value_col} (Top {len(labels)})")
            ax.tick_params(axis="x", rotation=45)

        data_b64 = fig_to_png_base64(fig)
        return {
            "event": resolved["event"],
            "session": session_code,
            "chartType": "session_results",
            "metric": metric,
            "mimeType": "image/png",
            "data": data_b64,
        }

    if method == "chart_lap_times":
        year = int(params["year"])
        event_query = str(params["eventQuery"])
        session_code = str(params["session"])
        driver = str(params["driver"])
        max_laps = int(params.get("maxLaps", 70))

        resolved = resolve_event(year=year, query=event_query, max_candidates=5)
        if resolved["matchType"] != "unique":
            raise ValueError(json.dumps({"error": "event_not_unique", "resolution": resolved}))

        event_name = str(resolved["event"]["eventName"])
        cs = get_cached_session(year, event_name, session_code)
        ensure_loaded(cs, results=False, laps=True, telemetry=False)

        laps_df = cs.session.laps.pick_driver(driver)
        if laps_df is None or laps_df.empty:
            raise ValueError(f"No laps available for driver {driver}")

        if "LapNumber" not in laps_df.columns or "LapTime" not in laps_df.columns:
            raise ValueError("LapNumber/LapTime columns not available")

        df = laps_df[["LapNumber", "LapTime"]].dropna().copy()
        if df.empty:
            raise ValueError("No lap time data available")

        df["LapTimeSeconds"] = df["LapTime"].dt.total_seconds()
        df = df.sort_values(by="LapNumber", ascending=True).head(max_laps)

        fig, ax = plt.subplots(figsize=(10, 4.8))
        ax.plot(df["LapNumber"], df["LapTimeSeconds"], color="#E10600", linewidth=2)
        ax.set_xlabel("Lap")
        ax.set_ylabel("Lap Time (seconds)")
        ax.set_title(f"{year} {event_name} {session_code} - {driver} Lap Times")
        ax.grid(True, alpha=0.2)

        data_b64 = fig_to_png_base64(fig)
        return {
            "event": resolved["event"],
            "session": session_code,
            "driver": driver,
            "chartType": "lap_times",
            "mimeType": "image/png",
            "data": data_b64,
        }

    year = int(params["year"])
    event_query = str(params["eventQuery"])
    session_code = str(params["session"])

    resolved = resolve_event(year=year, query=event_query, max_candidates=5)
    if resolved["matchType"] != "unique":
        raise ValueError(json.dumps({"error": "event_not_unique", "resolution": resolved}))

    event_name = str(resolved["event"]["eventName"])
    cs = get_cached_session(year, event_name, session_code)

    if method == "get_session_results":
        ensure_loaded(cs, results=True, laps=False, telemetry=False)
        max_rows = int(params.get("maxRows", 50))
        results_df = cs.session.results
        return {
            "event": resolved["event"],
            "session": session_code,
            "results": df_to_records(results_df, max_rows=max_rows),
        }

    if method == "get_laps":
        ensure_loaded(cs, results=False, laps=True, telemetry=False)
        max_rows = int(params.get("maxRows", 2000))
        laps_df = cs.session.laps
        driver = params.get("driver")
        if driver:
            laps_df = laps_df.pick_driver(str(driver))
        return {
            "event": resolved["event"],
            "session": session_code,
            "driver": driver,
            "laps": df_to_records(laps_df, max_rows=max_rows),
        }

    if method == "get_telemetry":
        ensure_loaded(cs, results=False, laps=True, telemetry=True)
        driver = str(params["driver"])
        lap_number = int(params["lapNumber"])
        sample_step = int(params.get("sampleStep", 5))
        max_rows = int(params.get("maxRows", 5000))

        laps_df = cs.session.laps.pick_driver(driver)
        lap_rows = laps_df[laps_df["LapNumber"] == lap_number]
        if lap_rows.empty:
            raise ValueError(f"No lap {lap_number} found for driver {driver}")

        lap = lap_rows.iloc[0]
        car = lap.get_car_data()
        if sample_step > 1:
            car = car.iloc[::sample_step]

        return {
            "event": resolved["event"],
            "session": session_code,
            "driver": driver,
            "lapNumber": lap_number,
            "sampleStep": sample_step,
            "telemetry": df_to_records(car, max_rows=max_rows),
        }

    raise ValueError(f"Unknown method: {method}")


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            req_id = req.get("id")
            method = req.get("method")
            params = req.get("params", {})
            if not isinstance(method, str) or not isinstance(params, dict):
                raise ValueError("Invalid request shape")
            result = handle(method, params)
            sys.stdout.write(json.dumps({"id": req_id, "ok": True, "result": result}) + "\n")
            sys.stdout.flush()
        except Exception as e:
            err = {"message": str(e)}
            try:
                req_id = json.loads(line).get("id")
            except Exception:
                req_id = None
            sys.stdout.write(json.dumps({"id": req_id, "ok": False, "error": err}) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
