"""Prerequisite expression parser and evaluator."""
from __future__ import annotations

import re
from typing import List, Optional


_PREREQ_COURSE_RE = re.compile(r'\b([A-Z]{3,4}\d{3}[A-Z]?)\b')
_GRADE_QUAL_RE = re.compile(
    r'[Mm]inimum\s+grade\s+of\s+[A-Z][+\-]?\s+in\s+|'
    r'[Mm]inimum\s+grade\s+of\s+[A-Z][+\-]?\s+|'
    r'\d+\s+course[s]?\s+(?:with\s+[^(]+\s+)?from\s+'
)


def _split_top_level(s: str, pattern: str) -> List[str]:
    """Split s on regex pattern, but only at parenthesis depth 0."""
    parts: List[str] = []
    depth = 0
    last = 0
    for m in re.finditer(r'[()]|(?:' + pattern + r')', s, re.I):
        tok = m.group()
        if tok == '(':
            depth += 1
        elif tok == ')':
            depth -= 1
        elif depth == 0:
            parts.append(s[last:m.start()])
            last = m.end()
    parts.append(s[last:])
    return [p.strip() for p in parts if p.strip()]


def _eval_prereq(s: str, completed: set) -> Optional[bool]:
    """
    Recursively evaluate a prereq expression.
    Returns True (met), False (definitely not met), None (uncertain/unparseable).
    """
    s = s.strip()
    if not s:
        return None

    or_groups = re.split(r';\s*or\s+', s, flags=re.I)
    if len(or_groups) == 1:
        or_groups = _split_top_level(s, r'\bor\b')

    if len(or_groups) > 1:
        results = [_eval_and_expr(g, completed) for g in or_groups]
        if any(r is True for r in results):
            return True
        if all(r is False for r in results):
            return False
        return None

    return _eval_and_expr(s, completed)


def _eval_and_expr(s: str, completed: set) -> Optional[bool]:
    parts = _split_top_level(s, r'\band\b')
    if not parts:
        return None
    results = [_eval_atom(p, completed) for p in parts]
    if all(r is True for r in results):
        return True
    if any(r is False for r in results):
        return False
    return None


def _eval_atom(s: str, completed: set) -> Optional[bool]:
    s = _GRADE_QUAL_RE.sub('', s).strip()

    if s.startswith('(') and s.endswith(')'):
        inner = s[1:-1].strip()
        if ';' in inner:
            alts = [a.strip() for a in inner.split(';') if a.strip()]
            results = [_eval_prereq(a, completed) for a in alts]
            if any(r is True for r in results):
                return True
            if all(r is False for r in results):
                return False
            return None
        return _eval_prereq(inner, completed)

    cids = set(_PREREQ_COURSE_RE.findall(s))
    if not cids:
        return None
    return all(cid in completed for cid in cids)


def prereq_status(prereq_str: str, completed_set: set) -> str:
    """
    Returns: 'met', 'not_met', 'check', or 'unknown'.
    - not_met  : parser is certain prereqs are NOT satisfied → hard exclude
    - met      : parser is certain prereqs ARE satisfied
    - check    : uncertain but some mentioned courses are missing → flag on card
    - unknown  : no course IDs found (permission of instructor, etc.)
    """
    if not prereq_str:
        return "unknown"

    normalized = _GRADE_QUAL_RE.sub('', prereq_str)
    normalized = ' '.join(normalized.split())

    result = _eval_prereq(normalized, completed_set)
    if result is True:
        return "met"
    if result is False:
        return "not_met"

    cids = set(_PREREQ_COURSE_RE.findall(prereq_str))
    if not cids:
        return "unknown"
    if cids <= completed_set:
        return "met"
    return "check"
