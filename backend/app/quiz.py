import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from .config import get_settings


class Media(BaseModel):
    type: Literal["image", "video"]
    src: str
    alt: str | None = None


class Question(BaseModel):
    id: str
    type: Literal["text", "multiple_choice", "song_artist"] = "text"
    prompt: str
    options: list[str] = Field(default_factory=list)
    media: Media | None = None
    masterNote: str | None = None
    correctAnswer: str | None = None
    acceptedAnswers: list[str] = Field(default_factory=list)

    def public_dict(self, include_answer: bool = False) -> dict[str, Any]:
        payload = self.model_dump(exclude={"correctAnswer", "acceptedAnswers", "masterNote"})
        if include_answer:
            payload["correctAnswer"] = self.correctAnswer
            payload["acceptedAnswers"] = self.acceptedAnswers
        return payload

    def admin_dict(self) -> dict[str, Any]:
        return self.model_dump()


class Block(BaseModel):
    id: str
    title: str
    description: str | None = None
    questions: list[Question]


class Quiz(BaseModel):
    title: str
    blocks: list[Block]

    def block_by_id(self, block_id: str) -> Block:
        for block in self.blocks:
            if block.id == block_id:
                return block
        raise KeyError(f"Unknown block: {block_id}")

    def question_by_id(self, question_id: str) -> Question:
        for block in self.blocks:
            for question in block.questions:
                if question.id == question_id:
                    return question
        raise KeyError(f"Unknown question: {question_id}")


@lru_cache
def load_quiz() -> Quiz:
    path = get_settings().quiz_path
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return Quiz.model_validate(data)
