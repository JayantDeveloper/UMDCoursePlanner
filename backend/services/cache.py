"""Simple in-process TTL cache for external API responses."""
from __future__ import annotations
from functools import wraps
from time import monotonic
from typing import Any, Tuple

_store: dict = {}


def _get(key) -> Tuple[bool, Any]:
    if key in _store:
        value, expires = _store[key]
        if monotonic() < expires:
            return True, value
        del _store[key]
    return False, None


def cached(ttl: int = 14_400):
    """Decorator: cache a function's return value by its positional args for `ttl` seconds."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args):
            key = (fn.__qualname__, args)
            hit, value = _get(key)
            if hit:
                return value
            value = fn(*args)
            _store[key] = (value, monotonic() + ttl)
            return value
        return wrapper
    return decorator
