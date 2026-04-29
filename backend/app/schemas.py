from typing import Literal

from pydantic import BaseModel, Field


class TeamCreateRequest(BaseModel):
    teamName: str = Field(min_length=1, max_length=80)
    captainName: str = Field(default="Captain", min_length=1, max_length=80)


class TeamJoinRequest(BaseModel):
    teamCode: str = Field(min_length=3, max_length=12)
    displayName: str = Field(min_length=1, max_length=80)


class AnswerUpsertRequest(BaseModel):
    questionId: str
    answer: str = Field(default="", max_length=1000)


class OpenBlockRequest(BaseModel):
    blockId: str


class SetVisibleQuestionCountRequest(BaseModel):
    visibleQuestionCount: int = Field(ge=0)


class ScoreItem(BaseModel):
    teamId: str
    questionId: str
    isCorrect: bool


class SubmitScoresRequest(BaseModel):
    blockId: str
    scores: list[ScoreItem]


class SetPhaseRequest(BaseModel):
    phase: Literal["lobby", "block_preview", "block_open", "block_closed", "review", "answers_revealed", "scoreboard", "finished"]
