"""Ollama AI wrapper, feedback generation, requirements scraping, and recommendations."""
from __future__ import annotations

import json
import random
import re
import time
from typing import Any, Dict, List

import requests
from bs4 import BeautifulSoup

from config import (
    ALL_GENEDS, AVAILABLE_COURSES_LIMIT, CATALOG_BASE,
    CATALOG_TEXT_LIMIT, GENED_CATEGORIES,
    MAX_FEEDBACK_REVIEWS, MAX_REVIEW_CHARS, USER_AGENT,
    GROQ_API_KEY, GROQ_MODEL,
)
from services.external import umdio_get
from services.prereqs import prereq_status


def _headers() -> Dict[str, str]:
    return {"User-Agent": USER_AGENT, "Accept": "application/json"}


def _chat(prompt: str, max_tokens: int = 2048, temperature: float = 0.4) -> str:
    if not GROQ_API_KEY:
        raise ValueError(
            "GROQ_API_KEY is not set. Add it to your .env file (backend/.env)."
        )
    resp = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": GROQ_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperature,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return (resp.json()["choices"][0]["message"]["content"] or "").strip()


def strip_markdown_fences(text: str) -> str:
    text = re.sub(r"^```[a-z]*\n?", "", text)
    return re.sub(r"\n?```$", "", text)


# ── Feedback ─────────────────────────────────────────────────────────────────


def build_feedback_prompt(course: str, professor: str, reviews: List[dict]) -> str:
    clipped, total = [], 0
    for r in reviews:
        text = (r.get("review") or "").strip()
        if not text:
            continue
        remaining = MAX_REVIEW_CHARS - total
        if remaining <= 0:
            break
        chunk = text[:remaining]
        clipped.append(chunk)
        total += len(chunk)

    block = "\n\n".join(f"- {t}" for t in clipped) or "No reviews provided."
    return (
        "You are UMD Course Planner, a study prep assistant. "
        "Use only the review content provided. "
        f"Start your response with: \"To prep for {course} with {professor}:\" "
        "Then provide 5-10 concise bullet points of prep advice based on the reviews. "
        "Return each bullet as a plain sentence on its own line with NO leading hyphen or numbering. "
        "Do not use Markdown asterisks or extra formatting. "
        "If the reviews are vague, say what is unknown.\n\n"
        f"Reviews:\n{block}"
    )


def generate_feedback(course: str, professor: str, reviews: List[dict]) -> str:
    if len(reviews) > MAX_FEEDBACK_REVIEWS:
        reviews = random.sample(reviews, MAX_FEEDBACK_REVIEWS)
    prompt = build_feedback_prompt(course, professor, reviews)
    result = _chat(prompt, max_tokens=1024)
    if not result:
        raise ValueError("Empty response from AI")
    return result


# ── Requirements scraping ─────────────────────────────────────────────────────


def scrape_requirements(catalog_url: str, program_name: str) -> dict:
    resp = requests.get(catalog_url, headers=_headers(), timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    content_div = soup.find("div", class_=re.compile(r"text|content|body", re.I)) or soup.find("main") or soup.body
    raw_text = content_div.get_text(separator="\n", strip=True) if content_div else resp.text
    raw_text = raw_text[:CATALOG_TEXT_LIMIT]

    prompt = (
        f"Extract all course requirements for the '{program_name}' program from the academic catalog text below.\n\n"
        "Return ONLY valid JSON — no prose, no markdown fences. Format:\n"
        '{"totalCredits":"120","sections":['
        '{"title":"Required Courses","type":"required","courses":['
        '{"course_id":"CMSC131","name":"Object-Oriented Programming I","credits":"4"}]},'
        '{"title":"Choose 2 from Systems","type":"elective","select_n":2,"courses":['
        '{"course_id":"CMSC411","name":"Computer Systems","credits":"3"}]}'
        "]}\n\n"
        "Rules:\n"
        "- course_id must match the UMD format exactly (e.g. CMSC131, MATH140)\n"
        "- type is 'required' or 'elective'\n"
        "- include ALL courses mentioned\n\n"
        f"Catalog text:\n{raw_text}"
    )
    text_out = strip_markdown_fences(_chat(prompt, max_tokens=4096, temperature=0.1))

    json_match = re.search(r"\{[\s\S]*\}", text_out)
    if not json_match:
        return {"sections": [], "error": "Could not parse requirements"}
    try:
        return json.loads(json_match.group(0))
    except json.JSONDecodeError as exc:
        return {"sections": [], "error": f"JSON parse error: {exc}"}


# ── Recommendations ───────────────────────────────────────────────────────────


_GRADE_QUAL_RE = re.compile(
    r'[Mm]inimum\s+grade\s+of\s+[A-Z][+\-]?\s+in\s+|'
    r'[Mm]inimum\s+grade\s+of\s+[A-Z][+\-]?\s+|'
    r'\d+\s+course[s]?\s+(?:with\s+[^(]+\s+)?from\s+'
)


def _build_recommend_prompt(
    majors: List[dict],
    minors: List[dict],
    completed_ids: List[str],
    available_courses: List[dict],
    term_label: str,
    interests: str,
    req_tags: Dict[str, List[str]],
    outstanding_geneds: List[str],
) -> str:
    completed_set = set(completed_ids)

    def fmt_sections(reqs: dict) -> str:
        lines = []
        for sec in (reqs or {}).get("sections", []):
            lines.append(f"\n  [{sec.get('type','').upper()}] {sec.get('title','')}")
            n = sec.get("select_n")
            if n:
                lines.append(f"  (Choose {n})")
            for c in sec.get("courses", []):
                done = "✓" if c["course_id"] in completed_set else "○"
                lines.append(f"  {done} {c['course_id']} — {c.get('name','')} ({c.get('credits','')} cr)")
        return "\n".join(lines)

    def fmt_course(c: dict) -> str:
        cid = c.get("course_id", "")
        tags = list(req_tags.get(cid, []))
        for g in (c.get("gen_ed") or []):
            tags.extend(g if isinstance(g, list) else [str(g)])
        tag_str = f" [{', '.join(tags)}]" if tags else ""
        prereq = (c.get("relationships") or {}).get("prereqs") or ""
        status = c.get("_prereq_status", "unknown")
        if prereq:
            warn = " ⚠ verify prereq AND/OR conditions" if status == "check" else ""
            prereq_str = f" | prereqs: {prereq}{warn}"
        else:
            prereq_str = ""
        return f"  {cid}: {c.get('name','')} ({c.get('credits','')} cr){tag_str}{prereq_str}"

    avail_str = "\n".join(fmt_course(c) for c in available_courses[:AVAILABLE_COURSES_LIMIT])

    gened_section = (
        f"OUTSTANDING GEN-ED REQUIREMENTS: {', '.join(outstanding_geneds)}\n"
        "(These graduation requirements are not yet satisfied — prioritize courses that fulfill them.)\n\n"
        if outstanding_geneds
        else "ALL GEN-ED REQUIREMENTS SATISFIED\n\n"
    )

    multi = len(majors) > 1
    majors_block = ""
    for i, m in enumerate(majors):
        label = f"MAJOR {i + 1}" if multi else "MAJOR"
        majors_block += f"{label}: {m['name']}\n{label} REQUIREMENTS:{fmt_sections(m.get('reqs', {}))}\n\n"

    minors_block = ""
    multi_min = len(minors) > 1
    for i, m in enumerate(minors):
        label = f"MINOR {i + 1}" if multi_min else "MINOR"
        minors_block += f"{label}: {m['name']}\n{label} REQUIREMENTS:{fmt_sections(m.get('reqs', {}))}\n\n"

    return (
        "You are an expert UMD academic advisor. Help this student plan their next semester.\n\n"
        + majors_block
        + minors_block
        + f"COMPLETED COURSES: {', '.join(completed_ids) or 'None provided'}\n\n"
        + gened_section
        + f"AVAILABLE NEXT SEMESTER ({term_label}):\n{avail_str}\n\n"
        + (f"STUDENT INTERESTS: {interests}\n\n" if interests else "")
        + "Recommend 5–8 courses for next semester.\n"
        "Rules:\n"
        "- CRITICAL: Only recommend courses whose prerequisites the student has completed. "
        "Check each course's prereqs field against COMPLETED COURSES.\n"
        "- Priority order: major/minor required → major/minor elective → outstanding gen-eds → other gen-eds.\n"
        "- When recommending gen-ed courses, prefer those that fulfill an OUTSTANDING GEN-ED REQUIREMENT.\n"
        "- Consider prerequisite chains, credit balance, and difficulty sequencing.\n\n"
        "Return ONLY a JSON array — no prose, no markdown fences:\n"
        '[{"course_id":"CMSC351","name":"Algorithms","priority":"High",'
        '"reason":"Core requirement; prereqs CMSC250+MATH141 complete",'
        '"fulfills":"Required — Upper Level","credits":"3","prereqs":"CMSC250 and MATH141"}]'
    )


def get_recommendations(
    majors: List[dict],
    minors: List[dict],
    completed_courses: List,
    term_id: str,
    interests: str,
) -> dict:
    sem_map = {"01": "Spring", "05": "Summer", "08": "Fall", "12": "Winter"}
    sem_label = f"{sem_map.get(term_id[-2:], '')} {term_id[:4]}"

    multi_maj = len(majors) > 1
    multi_min = len(minors) > 1
    req_tags: Dict[str, List[str]] = {}
    for i, m in enumerate(majors):
        prefix = f"Major {i + 1}" if multi_maj else "Major"
        for sec in (m.get("reqs") or {}).get("sections", []):
            tag = f"{prefix} Required" if sec.get("type") == "required" else f"{prefix} Elective"
            for c in sec.get("courses", []):
                req_tags.setdefault(c["course_id"], []).append(tag)
    for i, m in enumerate(minors):
        prefix = f"Minor {i + 1}" if multi_min else "Minor"
        for sec in (m.get("reqs") or {}).get("sections", []):
            tag = f"{prefix} Required" if sec.get("type") == "required" else f"{prefix} Elective"
            for c in sec.get("courses", []):
                req_tags.setdefault(c["course_id"], []).append(tag)

    dept_ids = list({cid[:4] for cid in req_tags if cid})
    available: List[dict] = []
    existing_ids: set = set()

    for dept in dept_ids[:8]:
        try:
            data = umdio_get("/courses", {"dept_id": dept, "semester": term_id, "per_page": "50"})
            if isinstance(data, list):
                for c in data:
                    cid = c.get("course_id", "")
                    if cid and cid not in existing_ids:
                        available.append(c)
                        existing_ids.add(cid)
            time.sleep(0.1)
        except Exception:
            pass

    for cat in GENED_CATEGORIES:
        try:
            data = umdio_get("/courses", {"gen_ed": cat, "semester": term_id, "per_page": "30"})
            if isinstance(data, list):
                for c in data:
                    cid = c.get("course_id", "")
                    if cid and cid not in existing_ids:
                        available.append(c)
                        existing_ids.add(cid)
            time.sleep(0.1)
        except Exception:
            pass

    completed_ids = [c if isinstance(c, str) else c.get("course_id", "") for c in (completed_courses or [])]
    completed_ids = [c for c in completed_ids if c]
    completed_set = set(completed_ids)

    satisfied_geneds: set = set()
    for c in (completed_courses or []):
        if isinstance(c, dict):
            for g in (c.get("gen_eds") or []):
                satisfied_geneds.add(g)
    outstanding_geneds = sorted(ALL_GENEDS - satisfied_geneds)

    filtered: List[dict] = []
    for c in available:
        prereq = (c.get("relationships") or {}).get("prereqs") or ""
        status = prereq_status(prereq, completed_set)
        c["_prereq_status"] = status
        if status != "not_met":
            filtered.append(c)
    available = filtered

    gened_lookup: Dict[str, List[str]] = {}
    prereq_status_map: Dict[str, str] = {}
    for c in available:
        cid = c.get("course_id", "")
        if not cid:
            continue
        prereq_status_map[cid] = c.get("_prereq_status", "unknown")
        flat: List[str] = []
        for g in (c.get("gen_ed") or []):
            flat.extend(g if isinstance(g, list) else [str(g)])
        if flat:
            gened_lookup[cid] = flat

    prompt = _build_recommend_prompt(
        majors, minors,
        completed_ids, available, sem_label, interests, req_tags,
        outstanding_geneds,
    )

    text_out = strip_markdown_fences(_chat(prompt, max_tokens=2048, temperature=0.3))

    arr_match = re.search(r"\[[\s\S]*\]", text_out)
    if not arr_match:
        raise ValueError("Could not parse recommendations from AI")
    recommendations = json.loads(arr_match.group(0))

    for rec in recommendations:
        cid = rec.get("course_id", "")
        tags: List[str] = list(req_tags.get(cid, []))
        for cat in gened_lookup.get(cid, []):
            tags.append(f"Gen-Ed: {cat}")
        num_match = re.search(r"\d+", cid)
        if num_match and int(num_match.group()) >= 300:
            tags.append("Upper Division")
        if prereq_status_map.get(cid) == "check":
            tags.append("Check Prereqs")
        rec["tags"] = tags

    return {"recommendations": recommendations, "termLabel": sem_label}
