"""Academic programs catalog scraping and caching."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from config import CATALOG_BASE, PROGRAMS_CACHE_TTL_H, USER_AGENT


_programs_cache: Optional[List[dict]] = None
_programs_cache_ts: Optional[datetime] = None

_DEGREE_SUFFIX = re.compile(
    r',?\s*(B\.?S\.?|B\.?A\.?|B\.?E\.?|B\.?F\.?A\.?|B\.?Mus\.?)\s*\.?\s*$', re.I
)
_ROLE_SUFFIX = re.compile(r'\s+(Major|Minor)\s*$', re.I)
_MAJOR_WORD = re.compile(r'\bMajor\b', re.I)
_MINOR_WORD = re.compile(r'\bMinor\b', re.I)

# Map URL slug → human-readable school name
_SCHOOL_NAMES: Dict[str, str] = {
    "agriculture-natural-resources": "Agriculture & Natural Resources",
    "arts-humanities": "Arts & Humanities",
    "behavioral-social-sciences": "Behavioral & Social Sciences",
    "business": "Smith School of Business",
    "computer-mathematical-natural-sciences": "Computer, Math & Natural Sciences",
    "education": "Education",
    "engineering": "Engineering",
    "journalism": "Journalism",
    "public-policy": "School of Public Policy",
    "school-architecture-planning-preservation": "Architecture, Planning & Preservation",
    "school-public-health": "Public Health",
}


def _headers() -> Dict[str, str]:
    return {"User-Agent": USER_AGENT, "Accept": "application/json"}


def _normalize_program_name(raw: str) -> str:
    name = _DEGREE_SUFFIX.sub("", raw).strip()
    return _ROLE_SUFFIX.sub("", name).strip()


def _school_from_url(url: str) -> str:
    path = urlparse(url).path
    parts = [p for p in path.split("/") if p]
    try:
        idx = parts.index("colleges-schools")
        slug = parts[idx + 1]
        return _SCHOOL_NAMES.get(slug, slug.replace("-", " ").title())
    except (ValueError, IndexError):
        return ""


def _classify(raw_name: str, url: str) -> Optional[str]:
    """
    Return 'major', 'minor', or None (meaning: skip this entry).

    Rules:
    - Skip anything with 'certificate' in URL or name — those aren't majors/minors.
    - Determine type from URL first (most reliable), then fall back to raw link text.
    - If neither URL nor name indicates major/minor, it's a department/school page → skip.
    """
    url_l = url.lower()
    name_l = raw_name.lower()

    # Certificates are not majors or minors
    if "certificate" in url_l or name_l.endswith("certificate"):
        return None

    # URL-based classification (most reliable)
    if "minor" in url_l:
        return "minor"
    if "major" in url_l:
        return "major"

    # Fall back to explicit word in link text (e.g. Shady Grove programs)
    if _MINOR_WORD.search(raw_name):
        return "minor"
    if _MAJOR_WORD.search(raw_name):
        return "major"

    # No signal → department/school overview page, skip
    return None


def fetch_programs() -> List[dict]:
    global _programs_cache, _programs_cache_ts
    now = datetime.utcnow()
    if (
        _programs_cache
        and _programs_cache_ts
        and (now - _programs_cache_ts).total_seconds() < PROGRAMS_CACHE_TTL_H * 3600
    ):
        return _programs_cache

    resp = requests.get(f"{CATALOG_BASE}/undergraduate/programs/", headers=_headers(), timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    seen_urls: set = set()
    by_key: dict = {}

    for a in soup.find_all("a", href=True):
        href: str = a["href"]
        if "/undergraduate/colleges-schools/" not in href:
            continue
        raw_name = a.get_text(strip=True)
        if not raw_name or len(raw_name) < 3:
            continue
        full_url = href if href.startswith("http") else f"{CATALOG_BASE}{href}"
        if full_url in seen_urls:
            continue
        seen_urls.add(full_url)

        ptype = _classify(raw_name, full_url)
        if ptype is None:
            continue

        name = _normalize_program_name(raw_name)
        if not name:
            continue

        school = _school_from_url(full_url)

        key = (name.lower(), ptype)
        if key not in by_key:
            by_key[key] = {"name": name, "url": full_url, "type": ptype, "school": school}
        else:
            # Prefer the URL that explicitly contains major/minor in the path
            cur_url = by_key[key]["url"]
            if ("major" in full_url or "minor" in full_url) and \
               ("major" not in cur_url and "minor" not in cur_url):
                by_key[key]["url"] = full_url

    _programs_cache = list(by_key.values())
    _programs_cache_ts = now
    return _programs_cache
