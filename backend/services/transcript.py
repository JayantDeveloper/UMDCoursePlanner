"""Playwright-based transcript scraping and fixed-width text parser."""
from __future__ import annotations

import re
from typing import Dict, List, Optional

from config import ALL_GENEDS, TESTUDO_BASE


_GENED_TAG_RE = re.compile(r'\b(FSAW|FSAR|FSMA|FSOC|FSPW|DSHU|DSHS|DSNS|DSNL|DSSP|DVCC|DVUP|SCIS)\b')

_SEM_PAT = re.compile(
    r"^\s*(Fall|Spring|Summer\s+I{1,3}|Summer\s+II|Winter)\s+(\d{4})\s*$", re.I
)
_HIST_COURSE = re.compile(
    r"^\s+([A-Z]{3,4}\d{3}[A-Z]?)\s+.+?\s+([A-Z][+\-]?|W|NC|P|S|F)\s+(\d+\.\d{2})\s+\d+\.\d{2}(.*)"
)
_XFER_EQUIV = re.compile(
    r"\bP\b\s+\d+\.\d{2}\s+([A-Z]{3,4}\d{3}[A-Z]?)(.*)"
)
_CURR_COURSE = re.compile(
    r"^\s+([A-Z]{3,4}\d{3}[A-Z]?)\s+\S+\s+\d+\.\d{2}\s+REG\s+([AD])\s+(\d{2}/\d{2}/\d{2})\s{1,4}(\d{2}/\d{2}/\d{2})?"
)


def parse_transcript_text(text: str) -> dict:
    """
    Parse the UMD unofficial transcript fixed-width text format.

    Three sections:
      1. Transfer credit equivalences  (AP/IB → UMD course codes)
      2. Historic completed courses    (per-semester rows with grades)
      3. Current term enrollments      (add/drop transaction log)
    """
    lines = text.splitlines()
    section: Optional[str] = None
    current_semester: Optional[str] = None

    detected_major = ""
    m_maj = re.search(r'\bMajor:\s+(.+)$', text, re.MULTILINE)
    if m_maj:
        raw = m_maj.group(1).strip()
        detected_major = re.sub(r'\s*-[^-]+\s+T\s*$', '', raw).strip()
        detected_major = re.sub(r'\s+T\s*$', '', detected_major).strip()

    detected_minor = ""
    m_min = re.search(r'\bMinor:\s+(.+)$', text, re.MULTILINE)
    if m_min:
        raw = m_min.group(1).strip()
        detected_minor = re.sub(r'\s*-[^-]+\s+T\s*$', '', raw).strip()
        detected_minor = re.sub(r'\s+T\s*$', '', detected_minor).strip()

    completed: List[dict] = []
    in_progress_txns: dict = {}
    satisfied_geneds: set = set()

    for line in lines:
        if "Transfer Credit Information" in line:
            section = "transfer"
            continue
        if "Historic Course Information" in line:
            section = "historic"
            current_semester = None
            continue
        if "Current Course Information" in line:
            section = "current"
            current_semester = None
            continue

        if section == "transfer":
            if "No Credit" in line:
                continue
            m = _XFER_EQUIV.search(line)
            if m:
                gen_eds = _GENED_TAG_RE.findall(m.group(2))
                satisfied_geneds.update(gen_eds)
                completed.append({
                    "course_id": m.group(1),
                    "grade": "P",
                    "credits": None,
                    "semester": "Transfer",
                    "gen_eds": gen_eds,
                })
            elif re.search(r"\bP\b\s+(?!0\.00)\d+\.\d{2}", line):
                gen_eds = _GENED_TAG_RE.findall(line)
                satisfied_geneds.update(gen_eds)

        elif section == "historic":
            sem = _SEM_PAT.match(line)
            if sem:
                current_semester = sem.group(0).strip()
                continue
            m = _HIST_COURSE.match(line)
            if m:
                grade = m.group(2)
                if grade == "NC":
                    continue
                gen_eds = _GENED_TAG_RE.findall(m.group(4) or "")
                satisfied_geneds.update(gen_eds)
                completed.append({
                    "course_id": m.group(1),
                    "grade": grade,
                    "credits": float(m.group(3)),
                    "semester": current_semester,
                    "gen_eds": gen_eds,
                })

        elif section == "current":
            sem = _SEM_PAT.match(line)
            if sem and "Course" not in line:
                current_semester = sem.group(0).strip()
                continue
            sem2 = re.match(r"^\s*(Fall|Spring|Summer|Winter)\s+\d{4}", line, re.I)
            if sem2 and "Course" in line:
                current_semester = re.match(
                    r"^\s*(\S+\s+\d{4})", line.strip()
                ).group(1) if re.match(r"^\s*\S+\s+\d{4}", line) else current_semester

            m = _CURR_COURSE.match(line)
            if m:
                course_id = m.group(1)
                add_drop = m.group(2)
                drop_date = m.group(4)
                in_progress_txns[course_id] = {
                    "add_drop": add_drop,
                    "has_drop_date": bool(drop_date),
                    "semester": current_semester,
                    "gen_eds": _GENED_TAG_RE.findall(line),
                }

    in_progress = []
    for cid, txn in in_progress_txns.items():
        if txn["add_drop"] == "A" and not txn["has_drop_date"]:
            gen_eds = txn.get("gen_eds", [])
            satisfied_geneds.update(gen_eds)
            in_progress.append({"course_id": cid, "semester": txn["semester"], "gen_eds": gen_eds})

    seen: set = set()
    unique_completed: List[dict] = []
    for c in completed:
        if c["course_id"] not in seen:
            seen.add(c["course_id"])
            unique_completed.append(c)

    return {
        "completed": unique_completed,
        "in_progress": in_progress,
        "satisfied_geneds": sorted(satisfied_geneds),
        "detected_major": detected_major,
        "detected_minor": detected_minor,
    }


def scrape_transcript_playwright() -> dict:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    W, H = 1152, 720

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=False,
            args=[f"--window-size={W},{H}", "--window-position=80,40"],
        )
        context = browser.new_context(viewport={"width": W, "height": H})
        page = context.new_page()

        # Testudo uses Angular hash routing — CAS only sees the base URL, never
        # the #/main/... fragment. After login, CAS always redirects to the base
        # URL and Angular defaults to #/main/schedule. We navigate to the
        # transcript only after Angular has finished loading post-login.
        page.goto(f"{TESTUDO_BASE}/#/main/uotrans")
        print("[UMD Course Planner] Browser opened — please log in to Testudo (Duo Push if required)…")

        _TRANSCRIPT_JS = (
            "() => document.body.innerText.includes('UNOFFICIAL TRANSCRIPT') "
            "|| document.body.innerText.includes('Historic Course Information') "
            "|| document.body.innerText.includes('Cumulative GPA')"
        )

        try:
            # Wait until CAS + Duo auth completes and Angular has loaded
            page.wait_for_function(
                "() => window.location.hostname === 'app.testudo.umd.edu' "
                "&& window.location.hash.startsWith('#/main/')",
                timeout=180_000,
            )
            # Let Angular fully settle after the CAS redirect (networkidle + brief pause)
            try:
                page.wait_for_load_state("networkidle", timeout=8_000)
            except PWTimeout:
                pass
            page.wait_for_timeout(800)

            # Navigate within Angular's router via hash change — avoids full reload
            # and any risk of re-triggering CAS. Retry up to 3 times.
            for attempt in range(3):
                page.evaluate("window.location.hash = '#/main/uotrans'")
                try:
                    page.wait_for_function(_TRANSCRIPT_JS, timeout=10_000)
                    break
                except PWTimeout:
                    if attempt == 2:
                        raise
                    page.wait_for_timeout(1_000)

            page.wait_for_timeout(600)
        except PWTimeout as exc:
            browser.close()
            raise ValueError(
                "Timed out. Log in to Testudo within 3 minutes, then the transcript will import automatically."
            ) from exc

        transcript_text = page.inner_text("body")
        browser.close()

    return parse_transcript_text(transcript_text)
