"""FastAPI application: middleware, error normalisation, health endpoints, lifespan."""

from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.cache import close_redis, ping as redis_ping
from app.core.config import settings
from app.core.exceptions import StockSenseError
from app.core.logging import configure_logging, get_logger
from app.core.rate_limit import limiter
from app.db.base import engine

configure_logging()
log = get_logger("app")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    log.info("app.startup", env=settings.APP_ENV)
    yield
    await close_redis()
    await engine.dispose()
    log.info("app.shutdown")


def error_body(detail: str, code: str, field: str | None = None, **extra: Any) -> dict[str, Any]:
    return {"detail": detail, "code": code, "field": field, **extra}


def _field_from_loc(loc: tuple[Any, ...]) -> str | None:
    parts = [p for p in loc if p not in ("body", "query", "path", "header", "cookie")]
    out = ""
    for p in parts:
        if isinstance(p, int):
            out += f"[{p}]"
        else:
            out += ("." if out else "") + str(p)
    return out or None


def _clean_msg(msg: str) -> str:
    for prefix in ("Value error, ", "Assertion failed, "):
        if msg.startswith(prefix):
            msg = msg[len(prefix):]
    return msg[:1].upper() + msg[1:] if msg else "Invalid value"


STATUS_CODES = {
    400: "BAD_REQUEST", 401: "NOT_AUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED", 409: "CONFLICT", 422: "VALIDATION_ERROR", 429: "RATE_LIMITED",
}


def create_app() -> FastAPI:
    docs_enabled = not settings.is_production
    app = FastAPI(
        title="StockSense API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs" if docs_enabled else None,
        redoc_url="/api/redoc" if docs_enabled else None,
        openapi_url="/api/openapi.json" if docs_enabled else None,
    )
    app.state.limiter = limiter

    # ------------------------------------------------------------------ middleware
    @app.middleware("http")
    async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception as exc:  # render inside CORS so browsers can read the error body
            log.exception("http.unhandled_error", error=str(exc), path=request.url.path)
            response = JSONResponse(
                status_code=500,
                content=error_body("Unexpected server error. Please try again.", "INTERNAL_ERROR"),
            )
        elapsed = round((time.perf_counter() - started) * 1000, 1)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        if not request.url.path.startswith("/api/docs") and not request.url.path.startswith("/api/redoc"):
            response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        if request.url.path.startswith("/api/v1/auth") or request.url.path.startswith("/api/v1/users"):
            response.headers["Cache-Control"] = "no-store"
        if not request.url.path.startswith("/health"):
            log.info("http.request", method=request.method, path=request.url.path,
                     status=response.status_code, ms=elapsed)
        return response

    # CORS is added last so it is the outermost middleware and decorates every response.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,  # explicit list, never "*"
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    # ------------------------------------------------------------------ errors
    @app.exception_handler(StockSenseError)
    async def _domain_error(_: Request, exc: StockSenseError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code,
                            content=error_body(exc.detail, exc.code, exc.field, **exc.extra))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [{"field": _field_from_loc(tuple(e.get("loc", ()))), "detail": _clean_msg(str(e.get("msg", "")))}
                  for e in exc.errors()]
        first = errors[0] if errors else {"field": None, "detail": "Invalid input"}
        return JSONResponse(status_code=422,
                            content=error_body(first["detail"], "VALIDATION_ERROR", first["field"], errors=errors))

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limited(_: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(status_code=429,
                            content=error_body("Too many attempts. Try again later.", "RATE_LIMITED"),
                            headers={"Retry-After": "900"})

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = STATUS_CODES.get(exc.status_code, "ERROR")
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
        if exc.status_code == 404 and detail == "Not Found":
            detail = "Resource not found"
        return JSONResponse(status_code=exc.status_code, content=error_body(detail, code),
                            headers=getattr(exc, "headers", None))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("http.unhandled_error", error=str(exc))
        return JSONResponse(status_code=500,
                            content=error_body("Unexpected server error. Please try again.", "INTERNAL_ERROR"))

    # ------------------------------------------------------------------ health (unversioned)
    async def _db_ok() -> bool:
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    @app.get("/health", tags=["health"])
    async def health() -> JSONResponse:
        db, redis = await _db_ok(), await redis_ping()
        # Redis is a cache/limiter only; the API keeps serving (degraded) without it.
        body = {"status": "ok" if db else "error", "db": "ok" if db else "unavailable",
                "redis": "ok" if redis else "unavailable"}
        return JSONResponse(status_code=200 if db else 503, content=body)

    @app.get("/health/live", tags=["health"])
    async def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready", tags=["health"])
    async def ready() -> JSONResponse:
        ok = await _db_ok()
        return JSONResponse(status_code=200 if ok else status.HTTP_503_SERVICE_UNAVAILABLE,
                            content={"status": "ok" if ok else "unavailable"})

    app.include_router(api_router)
    return app


app = create_app()
