from functools import lru_cache
from pydantic import BaseModel
import os

from tara_core.config import load_env_file


class Settings(BaseModel):
    app_name: str = "TARA Analysis Platform API"
    api_prefix: str = "/api"
    database_url: str = ""
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


@lru_cache
def get_settings() -> Settings:
    load_env_file()
    origins = os.getenv("CORS_ORIGINS")
    database_url = os.getenv("DATABASE_URL", "")
    if origins:
        return Settings(
            database_url=database_url,
            cors_origins=[origin.strip() for origin in origins.split(",") if origin.strip()],
        )
    return Settings(database_url=database_url)
