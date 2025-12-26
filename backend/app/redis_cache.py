"""
Redis cache service for storing page summaries and other cached data.
"""

import logging
import os

import redis.asyncio as redis

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# TTL for cached summaries (7 days)
SUMMARY_TTL = 60 * 60 * 24 * 7


class RedisCache:
    def __init__(self):
        self.client: redis.Redis | None = None

    async def connect(self):
        """Initialize Redis connection."""
        try:
            self.client = redis.from_url(REDIS_URL, decode_responses=True)
            await self.client.ping()
            logger.info("✅ Redis connected successfully")
        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")
            self.client = None

    async def close(self):
        """Close Redis connection."""
        if self.client:
            await self.client.close()

    # ========== SUMMARY CACHE ==========

    async def get_summary(self, url: str) -> str | None:
        """Get cached summary for a URL."""
        if not self.client:
            return None
        try:
            key = f"summary:{url}"
            return await self.client.get(key)
        except Exception as e:
            logger.error(f"Redis get error: {e}")
            return None

    async def set_summary(self, url: str, summary: str):
        """Cache a summary with TTL."""
        if not self.client:
            return
        try:
            key = f"summary:{url}"
            await self.client.setex(key, SUMMARY_TTL, summary)
            logger.info(f"Cached summary for {url} (TTL: {SUMMARY_TTL}s)")
        except Exception as e:
            logger.error(f"Redis set error: {e}")

    async def delete_summary(self, url: str):
        """Delete a cached summary."""
        if not self.client:
            return
        try:
            key = f"summary:{url}"
            await self.client.delete(key)
        except Exception as e:
            logger.error(f"Redis delete error: {e}")


# Singleton
cache = RedisCache()
