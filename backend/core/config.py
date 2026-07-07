from functools import lru_cache
from pydantic import BaseModel
import os


class Settings(BaseModel):
    app_name: str = "TARA Analysis Platform API"
    api_prefix: str = "/api"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


@lru_cache
def get_settings() -> Settings:
    origins = os.getenv("CORS_ORIGINS")
    if origins:
        return Settings(cors_origins=[origin.strip() for origin in origins.split(",") if origin.strip()])
    return Settings()
