import time
import logging
import uuid
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("skillswap.access")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs every request with method, path, status code, and duration."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())[:8]
        start = time.perf_counter()

        logger.info(
            "[%s] --> %s %s",
            request_id,
            request.method,
            request.url.path,
        )

        try:
            response: Response = await call_next(request)
        except Exception as exc:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(
                "[%s] ERROR %s %s — %.1f ms — %s",
                request_id,
                request.method,
                request.url.path,
                elapsed,
                repr(exc),
            )
            raise

        elapsed = (time.perf_counter() - start) * 1000
        logger.info(
            "[%s] <-- %s %s %d — %.1f ms",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            elapsed,
        )
        return response
