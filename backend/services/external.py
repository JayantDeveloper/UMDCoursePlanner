"""PlanetTerp and umd.io API access, plus grade-stat computation."""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import requests

from config import (
    GPA_MAP, GRADE_GROUPS,
    PLANETTERP_BASE, UMDIO_BASE, USER_AGENT,
)
from services.cache import cached


def _headers() -> Dict[str, str]:
    return {"User-Agent": USER_AGENT, "Accept": "application/json"}


def pt_get(path: str, params: Optional[dict] = None) -> Any:
    resp = requests.get(f"{PLANETTERP_BASE}{path}", params=params, headers=_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def umdio_get(path: str, params: Optional[dict] = None) -> Any:
    resp = requests.get(f"{UMDIO_BASE}{path}", params=params, headers=_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def compute_grade_stats(grade_data: List[dict]) -> dict:
    totals = {g: 0 for g in GPA_MAP}
    withdrawals = 0
    for entry in grade_data:
        for grade in GPA_MAP:
            totals[grade] += entry.get(grade, 0)
        withdrawals += entry.get("W", 0)

    total_graded = sum(totals.values())
    if total_graded == 0:
        return {"avgGpa": None, "aRate": None, "distribution": {}, "totalStudents": 0}

    avg_gpa = round(sum(GPA_MAP[g] * c for g, c in totals.items()) / total_graded, 2)
    a_rate = round((totals["A+"] + totals["A"] + totals["A-"]) / total_graded * 100, 1)

    distribution = {}
    for group, grades in GRADE_GROUPS.items():
        count = sum(totals[g] for g in grades)
        if count:
            distribution[group] = round(count / total_graded * 100, 1)

    return {
        "avgGpa": avg_gpa,
        "aRate": a_rate,
        "distribution": distribution,
        "totalStudents": total_graded + withdrawals,
    }


@cached(ttl=14_400)
def get_sections_for_course(course_id: str, term_id: str) -> List[str]:
    data = umdio_get("/courses/sections", {"course_id": course_id, "semester": term_id})
    if not isinstance(data, list):
        return []
    seen: set = set()
    professors = []
    for section in data:
        for instructor in section.get("instructors", []):
            name = instructor.strip() if isinstance(instructor, str) else instructor.get("name", "").strip()
            if name and name.upper() not in ("TBA", "STAFF") and name not in seen:
                seen.add(name)
                professors.append(name)
    return professors


@cached(ttl=14_400)
def get_professor_data(name: str) -> dict:
    try:
        return pt_get("/professor", {"name": name, "reviews": "true"})
    except requests.exceptions.HTTPError as exc:
        if exc.response.status_code == 404:
            return {}
        raise


@cached(ttl=14_400)
def get_grade_stats(course_id: str, professor: str) -> dict:
    try:
        data = pt_get("/grades", {"course": course_id, "professor": professor})
        return compute_grade_stats(data if isinstance(data, list) else [])
    except requests.exceptions.HTTPError as exc:
        if exc.response.status_code == 404:
            return {"avgGpa": None, "aRate": None, "distribution": {}, "totalStudents": 0}
        raise


def filter_course_reviews(reviews: List[dict], course_id: str) -> List[dict]:
    normalized = course_id.upper().replace(" ", "")
    filtered = [r for r in reviews if (r.get("course") or "").replace(" ", "").upper() == normalized]
    return filtered if filtered else reviews


def betterprep_score(avg_rating: Optional[float], avg_gpa: Optional[float]) -> Optional[int]:
    r = avg_rating / 5 if avg_rating is not None else None
    g = avg_gpa / 4 if avg_gpa is not None else None
    if r is None and g is None:
        return None
    if r is None:
        return round(g * 100)
    if g is None:
        return round(r * 100)
    return round((r * 0.6 + g * 0.4) * 100)
