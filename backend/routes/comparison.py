"""Professor comparison endpoints: semesters, sections, compare, feedback."""
from __future__ import annotations

import time
from datetime import date

from flask import Blueprint, jsonify, request
import requests

from services.external import (
    filter_course_reviews,
    get_grade_stats,
    get_professor_data,
    get_sections_for_course,
)
from services.ai import generate_feedback

bp = Blueprint("comparison", __name__)


def _generate_semesters():
    today = date.today()
    year = today.year
    max_year = year + 1 if today.month >= 9 else year
    semesters = []
    for y in range(max_year, year - 2, -1):
        for month, label in [("08", "Fall"), ("05", "Summer"), ("01", "Spring")]:
            semesters.append({"termId": f"{y}{month}", "label": f"{label} {y}"})
    return semesters[:9]


@bp.route("/api/semesters", methods=["GET"])
def get_semesters():
    return jsonify(_generate_semesters())


@bp.route("/api/sections", methods=["POST"])
def get_sections():
    payload = request.get_json(silent=True) or {}
    course_id = (payload.get("courseId") or "").strip().upper()
    term_id = (payload.get("termId") or "").strip()

    if not course_id or not term_id:
        return jsonify({"error": "courseId and termId are required"}), 400

    try:
        professors = get_sections_for_course(course_id, term_id)
        if not professors:
            return jsonify({"error": f"No sections found for {course_id} that semester. Check the course ID or try a different semester."}), 404
        return jsonify({"courseId": course_id, "termId": term_id, "professors": professors})
    except requests.exceptions.HTTPError as exc:
        if exc.response.status_code == 404:
            return jsonify({"error": f"Course {course_id} not found. Check the course ID."}), 404
        return jsonify({"error": f"Network error: {exc}"}), 502
    except requests.exceptions.RequestException as exc:
        return jsonify({"error": f"Network error: {exc}"}), 502
    except Exception as exc:
        return jsonify({"error": f"Unexpected error: {exc}"}), 500


@bp.route("/api/compare", methods=["POST"])
def compare_professors():
    payload = request.get_json(silent=True) or {}
    course_id = (payload.get("courseId") or "").strip().upper()
    professors = payload.get("professors") or []

    if not course_id or not professors:
        return jsonify({"error": "courseId and professors list are required"}), 400

    results = []
    for name in professors:
        try:
            pt_data = get_professor_data(name)
            grade_stats = get_grade_stats(course_id, name)
            time.sleep(0.25)

            all_reviews = pt_data.get("reviews") or []
            course_reviews = filter_course_reviews(all_reviews, course_id)

            results.append({
                "name": name,
                "slug": pt_data.get("slug"),
                "avgRating": pt_data.get("average_rating"),
                "reviewCount": len(course_reviews),
                "grades": grade_stats,
                "recentReviews": [
                    {"text": r["review"], "rating": r.get("rating"), "grade": r.get("expected_grade")}
                    for r in course_reviews[:5]
                    if r.get("review")
                ],
                "onPlanetTerp": bool(pt_data),
            })
        except Exception as exc:
            results.append({
                "name": name,
                "slug": None,
                "avgRating": None,
                "reviewCount": 0,
                "grades": {"avgGpa": None, "aRate": None, "distribution": {}, "totalStudents": 0},
                "recentReviews": [],
                "onPlanetTerp": False,
                "error": str(exc),
            })

    return jsonify({"courseId": course_id, "professors": results})


@bp.route("/api/feedback", methods=["POST"])
def get_feedback():
    payload = request.get_json(silent=True) or {}
    course_id = (payload.get("courseId") or "").strip().upper()
    professor_name = (payload.get("professor") or "").strip()

    if not course_id or not professor_name:
        return jsonify({"error": "courseId and professor are required"}), 400

    try:
        pt_data = get_professor_data(professor_name)
        if not pt_data:
            return jsonify({"error": f"'{professor_name}' not found on PlanetTerp."}), 422
        all_reviews = pt_data.get("reviews") or []
        reviews = filter_course_reviews(all_reviews, course_id)
        if not reviews:
            return jsonify({"error": "No reviews found for this professor and course."}), 422
        feedback = generate_feedback(course_id, professor_name, reviews)
        return jsonify({"professor": professor_name, "courseId": course_id, "feedback": feedback, "reviewCount": len(reviews)})
    except requests.exceptions.RequestException as exc:
        return jsonify({"error": f"Network error: {exc}"}), 502
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:
        return jsonify({"error": f"Unexpected error: {exc}"}), 500
