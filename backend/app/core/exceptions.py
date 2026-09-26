"""Domain exceptions. Framework-agnostic: HTTP mapping happens in app.main."""

from __future__ import annotations


class StockSenseError(Exception):
    """Base error. Carries an HTTP status hint, a machine code and an optional field path."""

    status_code: int = 400
    code: str = "BAD_REQUEST"
    default_detail: str = "Request could not be processed"

    def __init__(self, detail: str | None = None, *, field: str | None = None, code: str | None = None,
                 extra: dict | None = None) -> None:
        self.detail = detail or self.default_detail
        self.field = field
        if code:
            self.code = code
        self.extra = extra or {}
        super().__init__(self.detail)


class BusinessRuleError(StockSenseError):
    status_code = 400
    code = "BUSINESS_RULE_VIOLATION"


class NotFoundError(StockSenseError):
    status_code = 404
    code = "NOT_FOUND"
    default_detail = "Resource not found"


class ConflictError(StockSenseError):
    status_code = 409
    code = "CONFLICT"
    default_detail = "Resource conflict"


class AuthenticationError(StockSenseError):
    status_code = 401
    code = "NOT_AUTHENTICATED"
    default_detail = "Not authenticated"


class PermissionDeniedError(StockSenseError):
    status_code = 403
    code = "FORBIDDEN"
    default_detail = "You do not have permission to perform this action"


class InputValidationError(StockSenseError):
    status_code = 422
    code = "VALIDATION_ERROR"
    default_detail = "Invalid input"


class RateLimitedError(StockSenseError):
    status_code = 429
    code = "RATE_LIMITED"
    default_detail = "Too many requests. Try again later."


class InsufficientStockError(StockSenseError):
    status_code = 422
    code = "INSUFFICIENT_STOCK"
    default_detail = "Insufficient stock"


class AlreadyValidatedError(ConflictError):
    code = "ALREADY_VALIDATED"
    default_detail = "Operation has already been validated"


class DuplicateSKUError(ConflictError):
    code = "DUPLICATE_SKU"
    default_detail = "A product with this SKU already exists"


class OTPExpiredError(StockSenseError):
    status_code = 400
    code = "OTP_EXPIRED"
    default_detail = "Code has expired. Request a new one."


class OTPMaxAttemptsError(StockSenseError):
    status_code = 429
    code = "OTP_MAX_ATTEMPTS"
    default_detail = "Too many incorrect attempts. Request a new code."


class UniqueViolation(Exception):
    """Raised by repositories when a unique constraint fails. Services translate it."""

    def __init__(self, constraint: str | None) -> None:
        self.constraint = constraint or ""
        super().__init__(self.constraint)
