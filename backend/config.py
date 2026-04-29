from __future__ import annotations

PLANETTERP_BASE = "https://api.planetterp.com/v1"
UMDIO_BASE = "https://api.umd.io/v1"
CATALOG_BASE = "https://academiccatalog.umd.edu"
TESTUDO_BASE = "https://app.testudo.umd.edu"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
)

MAX_REVIEW_CHARS = 12000
MAX_FEEDBACK_REVIEWS = 30
GROQ_MODEL_ID = "llama-3.3-70b-versatile"
CATALOG_TEXT_LIMIT = 7000
AVAILABLE_COURSES_LIMIT = 100
PROGRAMS_CACHE_TTL_H = 24

GENED_CATEGORIES = [
    "FSAW", "FSAR", "FSMA", "FSOC", "FSPW",
    "DSHU", "DSHS", "DSNS", "DSNL", "DSSP",
    "DVCC", "DVUP", "SCIS",
]

ALL_GENEDS = frozenset(GENED_CATEGORIES)

GPA_MAP = {
    "A+": 4.0, "A": 4.0, "A-": 3.7,
    "B+": 3.3, "B": 3.0, "B-": 2.7,
    "C+": 2.3, "C": 2.0, "C-": 1.7,
    "D+": 1.3, "D": 1.0, "D-": 0.7,
    "F": 0.0,
}

GRADE_GROUPS = {
    "A": ["A+", "A", "A-"],
    "B": ["B+", "B", "B-"],
    "C": ["C+", "C", "C-"],
    "D": ["D+", "D", "D-"],
    "F": ["F"],
}
