"""Course planner endpoints: programs, requirements, transcript, recommend, best-professors."""
from __future__ import annotations

import os
import time
from typing import Optional

from flask import Blueprint, jsonify, request
import requests

from services.external import (
    betterprep_score,
    get_grade_stats,
    get_professor_data,
    get_sections_for_course,
)
from services.ai import get_recommendations, scrape_requirements
from services.programs import fetch_programs
from services.transcript import scrape_transcript_playwright, parse_transcript_text

bp = Blueprint("planner", __name__)


@bp.route("/api/programs", methods=["GET"])
def get_programs():
    try:
        programs = fetch_programs()
        return jsonify(programs)
    except Exception as exc:
        return jsonify({"error": f"Failed to fetch programs: {exc}"}), 500


@bp.route("/api/requirements", methods=["POST"])
def get_requirements():
    payload = request.get_json(silent=True) or {}
    catalog_url = (payload.get("catalogUrl") or "").strip()
    program_name = (payload.get("programName") or "").strip()

    if not catalog_url or not program_name:
        return jsonify({"error": "catalogUrl and programName are required"}), 400

    try:
        reqs = scrape_requirements(catalog_url, program_name)
        return jsonify(reqs)
    except Exception as exc:
        return jsonify({"error": f"Failed to fetch requirements: {exc}"}), 500


@bp.route("/api/transcript", methods=["POST"])
def get_transcript():
    if os.environ.get("RENDER"):
        return jsonify({"error": "Transcript import is only available when running the app locally — paste your courses manually instead."}), 503
    try:
        result = scrape_transcript_playwright()
        if not result.get("completed") and not result.get("in_progress"):
            return jsonify({
                "warning": "Logged in but no courses found — the transcript page may not have loaded. Try again.",
                "completed": [],
                "in_progress": [],
            }), 200
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 408
    except Exception as exc:
        return jsonify({"error": f"Transcript error: {exc}"}), 500


@bp.route("/api/parse-transcript", methods=["POST"])
def parse_transcript():
    """Parse raw transcript text pasted by the user."""
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400
    try:
        result = parse_transcript_text(text)
        if not result.get("completed") and not result.get("in_progress"):
            return jsonify({"error": "No courses found — make sure you copied the full transcript page text."}), 422
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": f"Parse error: {exc}"}), 500


@bp.route("/api/recommend", methods=["POST"])
def get_recommend():
    payload = request.get_json(silent=True) or {}

    major_name = (payload.get("majorName") or "").strip()
    major_reqs = payload.get("majorReqs") or {}
    minor_name = (payload.get("minorName") or "").strip() or None
    minor_reqs = payload.get("minorReqs") or None
    completed_courses = payload.get("completedCourses") or []
    term_id = (payload.get("termId") or "").strip()
    interests = (payload.get("interests") or "").strip()

    if not major_name or not term_id:
        return jsonify({"error": "majorName and termId are required"}), 400

    try:
        result = get_recommendations(
            major_name, major_reqs, minor_name, minor_reqs,
            completed_courses, term_id, interests,
        )
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:
        return jsonify({"error": f"Recommendation error: {exc}"}), 500


@bp.route("/api/best-professors", methods=["POST"])
def get_best_professors():
    payload = request.get_json(silent=True) or {}
    course_ids = payload.get("courseIds") or []
    term_id = (payload.get("termId") or "").strip()

    if not course_ids or not term_id:
        return jsonify({"error": "courseIds and termId required"}), 400

    result: dict = {}
    for course_id in course_ids[:10]:
        try:
            professors = get_sections_for_course(course_id, term_id)
            if not professors:
                continue
            best: Optional[dict] = None
            best_score = -1
            for prof_name in professors[:5]:
                try:
                    pt_data = get_professor_data(prof_name)
                    if not pt_data:
                        continue
                    grade_stats = get_grade_stats(course_id, prof_name)
                    avg_rating = pt_data.get("average_rating")
                    avg_gpa = grade_stats.get("avgGpa")
                    score = betterprep_score(avg_rating, avg_gpa)
                    effective = score if score is not None else -1
                    if effective > best_score:
                        best_score = effective
                        best = {
                            "name": prof_name,
                            "slug": pt_data.get("slug"),
                            "score": score,
                            "avgRating": avg_rating,
                            "avgGpa": avg_gpa,
                        }
                    time.sleep(0.15)
                except Exception:
                    pass
            if best:
                result[course_id] = best
        except Exception:
            pass

    return jsonify({"professors": result})
