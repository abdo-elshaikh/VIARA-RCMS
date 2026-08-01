import hmac

from fastapi import Header, HTTPException, status

from .config import Settings


def authorize_request(settings: Settings, authorization: str | None) -> None:
    if settings.configuration_errors:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PACS AI worker is not configured securely.",
        )

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token or not hmac.compare_digest(
        token, settings.worker_api_key
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid worker credential.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def authorization_header(authorization: str | None = Header(default=None)) -> str | None:
    return authorization

