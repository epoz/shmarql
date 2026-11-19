"""Tests for the Redis-backed SPARQL query cache."""

from __future__ import annotations

import asyncio

from shmarql.cache import RedisCache, query_cache_key


def test_query_cache_key_is_scoped_per_profile_and_query():
    key = query_cache_key("abc123", "SELECT * WHERE { ?s ?p ?o }")
    assert key.startswith("shmarql:query:abc123:")
    assert len(key) > len("shmarql:query:abc123:")
    # The same query text for another profile is a different entry.
    assert query_cache_key("other", "SELECT * WHERE { ?s ?p ?o }") != key


def test_redis_cache_get_returns_none_when_backend_unreachable():
    cache = RedisCache("redis://127.0.0.1:1/", ttl=30.0)
    assert asyncio.run(cache.get("shmarql:query:test")) is None
    asyncio.run(cache.close())


def test_redis_cache_set_does_not_raise_when_backend_unreachable():
    cache = RedisCache("redis://127.0.0.1:1/", ttl=30.0)
    asyncio.run(cache.set("shmarql:query:test", "<html></html>"))
    asyncio.run(cache.close())
