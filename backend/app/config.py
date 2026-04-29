from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    admin_token: str = Field(default="2904", alias="ADMIN_TOKEN")
    database_path: Path = Field(default=Path("./data/quiz.sqlite"), alias="DATABASE_PATH")
    quiz_path: Path = Field(default=Path("./data/quiz.json"), alias="QUIZ_PATH")
    public_media_base_url: str = Field(default="/media", alias="PUBLIC_MEDIA_BASE_URL")
    cors_origins: str = Field(default="http://localhost:3000,http://localhost:5173", alias="CORS_ORIGINS")
    cors_origin_regex: str | None = Field(default=r"https://.*\.vercel\.app", alias="CORS_ORIGIN_REGEX")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    class Config:
        env_file = ".env"
        populate_by_name = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
