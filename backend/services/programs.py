"""Academic programs catalog scraping and caching."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Dict, List, Optional

import requests
from bs4 import BeautifulSoup

from config import CATALOG_BASE, PROGRAMS_CACHE_TTL_H, USER_AGENT


_programs_cache: Optional[List[dict]] = None
_programs_cache_ts: Optional[datetime] = None

_DEGREE_SUFFIX = re.compile(
    r',?\s*(B\.?S\.?|B\.?A\.?|B\.?E\.?|B\.?F\.?A\.?|B\.?Mus\.?)\s*\.?\s*$', re.I
)
_ROLE_SUFFIX = re.compile(r'\s+(Major|Minor)\s*$', re.I)


def _headers() -> Dict[str, str]:
    return {"User-Agent": USER_AGENT, "Accept": "application/json"}


def _normalize_program_name(raw: str) -> str:
    name = _DEGREE_SUFFIX.sub("", raw).strip()
    return _ROLE_SUFFIX.sub("", name).strip()


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

        ptype = "minor" if "minor" in href.lower() else "major"
        name = _normalize_program_name(raw_name)
        if not name:
            continue

        key = (name.lower(), ptype)
        if key not in by_key:
            by_key[key] = {"name": name, "url": full_url, "type": ptype}
        else:
            cur_url = by_key[key]["url"]
            if ("major" in full_url or "minor" in full_url) and ("major" not in cur_url and "minor" not in cur_url):
                by_key[key]["url"] = full_url

    _programs_cache = list(by_key.values())
    _programs_cache_ts = now
    return _programs_cache
