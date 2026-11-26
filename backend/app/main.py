import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.costs import router as costs_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.findings import router as findings_router
from app.api.routes.health import router as health_router
from app.api.routes.inventory import router as inventory_router
from app.api.routes.scans import router as scans_router
from app.api.v1.auth import router as auth_router
from app.api.v1.settings import router as settings_router
from app.config.settings import get_settings

settings = get_settings()
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger("cloudsentry")

app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled API error (%s)",
        type(exc).__name__,
        extra={"path": request.url.path},
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(health_router, prefix=settings.api_v1_prefix)
app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(settings_router, prefix=settings.api_v1_prefix)
app.include_router(scans_router, prefix=settings.api_v1_prefix)
app.include_router(findings_router, prefix=settings.api_v1_prefix)
app.include_router(inventory_router, prefix=settings.api_v1_prefix)
app.include_router(costs_router, prefix=settings.api_v1_prefix)
app.include_router(dashboard_router, prefix=settings.api_v1_prefix)
