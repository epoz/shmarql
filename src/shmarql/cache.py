"""Caching of SPARQL query results via a Redis instance.

Enabled when the ``REDIS_HOST`` setting is supplied; read-only SPARQL queries
(currently the entity viewer's CONSTRUCT, inverse relations, label and image /
coordinate lookups, and the query editor's typed queries) are then kept in Redis
for ``CACHE_TTL`` seconds and served from there on subsequent requests instead of
being re-executed against the triplestore.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import timedelta

from redis import RedisError
from redis.asyncio import Redis as AsyncRedis

log = logging.getLogger("shmarql.cache")

DEFAULT_TTL_SECONDS = 300.0
KEY_PREFIX = "shmarql"


def query_cache_key(profile_key: str, query: str) -> str:
    """Cache key of one SPARQL query result: backend profile plus query text."""
    digest = hashlib.sha256(query.encode("utf-8")).hexdigest()
    return f"{KEY_PREFIX}:query:{profile_key}:{digest}"


class RedisCache:
    """Async Redis cache for query results; disabled when no URL is given."""

    def __init__(self, url: str, ttl: float = DEFAULT_TTL_SECONDS, prefix: str = KEY_PREFIX):
        self.url = url
        self.ttl = ttl
        self.prefix = prefix
        self._client: AsyncRedis | None = None

    def _get_client(self) -> AsyncRedis:
        if self._client is None:
            self._client = AsyncRedis.from_url(self.url)
        return self._client

    async def get(self, key: str) -> str | None:
        """Return the cached value for ``key``, or ``None`` on miss/error."""
        client = self._get_client()
        try:
            value = await client.get(self.prefix + key)
        except RedisError as exc:
            log.warning("Redis cache get failed (%s): %s", self.url, exc)
            return None
        return value.decode() if isinstance(value, bytes) else value

    async def set(self, key: str, value: str, ttl: float | None = None) -> None:
        """Store ``value`` under ``key``; failures are logged and swallowed."""
        client = self._get_client()
        try:
            await client.set(
                self.prefix + key,
                value,
                ex=timedelta(seconds=ttl if ttl is not None else self.ttl),
            )
        except RedisError as exc:
            log.warning("Redis cache set failed (%s): %s", self.url, exc)

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            except RedisError as exc:
                log.warning("Redis cache close failed (%s): %s", self.url, exc)
            self._client = None
