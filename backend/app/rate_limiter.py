"""
Rate limiteur utilisant l'algorithme Token Bucket avec un script Lua pour l'atomicité.
"""

import logging
import time

from fastapi import HTTPException, Request, status

from .redis_cache import cache

logger = logging.getLogger(__name__)

# Script Lua pour l'algo
LUA_TOKEN_BUCKET = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

-- Récupérer l'état actuel (tokens, last_refill)
local data = redis.call("HMGET", key, "tokens", "last_refill")
local tokens = capacity
local last_refill = now

if data[1] then
    -- Si des données existent déjà
    local current_tokens = tonumber(data[1])
    local last_refill_time = tonumber(data[2])

    -- Calcul du refill
    local elapsed = now - last_refill_time
    local added = elapsed * refill_rate
    tokens = math.min(capacity, current_tokens + added)
    last_refill = now
end

-- Vérification
if tokens < requested then
    return {0, math.ceil(tokens)}  -- {rejected, remaining}
end

-- Consommation et Sauvegarde
tokens = tokens - requested
redis.call("HMSET", key, "tokens", tokens, "last_refill", now)
redis.call("EXPIRE", key, 3600)  -- Cleanup après 1h d'inactivité

return {1, math.ceil(tokens)}  -- {accepted, remaining}
"""


def get_client_ip(request: Request) -> str:
    # Get the real client IP, handling proxies."""
    # Check X-Forwarded-For header (a cause des proxies et reverse proxies)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Premiere ip de la liste est le client
        return forwarded.split(",")[0].strip()

    # Check X-Real-IP header
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip

    # sinon on check l'ip du client direct
    return request.client.host if request.client else "unknown"


async def check_rate_limit(
    key: str,
    capacity: int,
    refill_rate: float,
) -> tuple[bool, int]:
    """
    Args:
        key: Unique identifier for this rate limit (utilisant un prefix de la route + ip | userid)
        capacity: Maximum tokens
        refill_rate: Tokens added per second

    Returns:
        (allowed: bool, remaining: int)
    """
    if not cache.client:
        # Redis not available, allow request
        logger.warning("Redis not available, skipping rate limit")
        return True, capacity

    now = time.time()

    try:
        result = await cache.client.eval(
            LUA_TOKEN_BUCKET,
            1,  # Number of keys
            key,  # KEYS[1]
            capacity,  # ARGV[1]
            refill_rate,  # ARGV[2]
            now,  # ARGV[3]
            1,  # ARGV[4] - tokens requested
        )
        allowed = result[0] == 1
        remaining = result[1]
        return allowed, remaining
    except Exception as e:
        logger.error(f"Rate limit check failed: {e}")
        # On error, allow request (fail open)
        return True, capacity


class RateLimiter:
    """
    FastAPI dependency for rate limiting.

    Usage:
        @app.post("/api/endpoint")
        async def endpoint(
            request: Request,
            _: None = Depends(RateLimiter(limit=5, window=60))
        ):
    """

    def __init__(
        self,
        limit: int,
        window: int = 60,
        key_prefix: str = "ratelimit",
        use_user_id: bool = False,
    ):
        """
        Args:
            limit: Max requests per window
            window: Time window in seconds
            key_prefix: Prefix for Redis key (usually endpoint name)
            use_user_id: If True, use user_id for key (requires auth)
        """
        self.limit = limit
        self.window = window
        self.key_prefix = key_prefix
        self.use_user_id = use_user_id
        # Calculate refill rate: limit tokens over window seconds
        self.refill_rate = limit / window

    async def __call__(self, request: Request) -> None:
        # Determine the key identifier
        if self.use_user_id:
            # Try to get user from request state (set by auth dependency)
            user = getattr(request.state, "user", None)
            if user:
                identifier = f"user_{user['user_id']}"
            else:
                # Fallback to IP if no user
                identifier = f"ip_{get_client_ip(request)}"
        else:
            identifier = f"ip_{get_client_ip(request)}"

        key = f"{self.key_prefix}:{identifier}"

        allowed, remaining = await check_rate_limit(
            key=key,
            capacity=self.limit,
            refill_rate=self.refill_rate,
        )

        if not allowed:
            logger.warning(f"Rate limit exceeded for {key}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please try again later.",
                headers={
                    "X-RateLimit-Limit": str(self.limit),
                    "X-RateLimit-Remaining": str(remaining),
                    "X-RateLimit-Reset": str(self.window),
                },
            )

        # Add rate limit headers to response (via middleware or manually)
        request.state.rate_limit_remaining = remaining
        request.state.rate_limit_limit = self.limit
