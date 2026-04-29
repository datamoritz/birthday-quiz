import random
import secrets
import string
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .auth import require_admin, require_participant
from .config import get_settings
from .db import connect, init_db
from .quiz import Block, Question, load_quiz
from .schemas import (
    AnswerUpsertRequest,
    OpenBlockRequest,
    SetPhaseRequest,
    SetVisibleQuestionCountRequest,
    SubmitScoresRequest,
    TeamCreateRequest,
    TeamJoinRequest,
)

app = FastAPI(title="Birthday Quiz API")
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/media", StaticFiles(directory="media"), name="media")


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    load_quiz()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def generate_team_code() -> str:
    return "".join(random.choice(string.digits) for _ in range(4))


def game_state() -> dict[str, Any]:
    with connect() as conn:
        return dict(conn.execute("SELECT * FROM game_state WHERE id = 1").fetchone())


def all_teams() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT t.id, t.name, t.code, COUNT(p.id) AS participant_count
            FROM teams t
            LEFT JOIN participants p ON p.team_id = t.id
            GROUP BY t.id
            ORDER BY t.created_at
            """
        ).fetchall()
    return [dict(row) for row in rows]


def scoreboard() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT t.id, t.name, COALESCE(SUM(s.points_awarded), 0) AS score
            FROM teams t
            LEFT JOIN scores s ON s.team_id = t.id
            GROUP BY t.id
            ORDER BY score DESC, t.created_at
            """
        ).fetchall()
    return [dict(row) for row in rows]


def active_block_and_questions(state: dict[str, Any], include_answers: bool = False) -> tuple[Block | None, list[dict[str, Any]]]:
    if not state["active_block_id"]:
        return None, []
    block = load_quiz().block_by_id(state["active_block_id"])
    count = min(state["visible_question_count"], len(block.questions))
    return block, [question.public_dict(include_answer=include_answers) for question in block.questions[:count]]


def block_is_editable(state: dict[str, Any]) -> bool:
    return state["phase"] == "block_open" and bool(state["active_block_id"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/quiz")
def quiz_overview() -> dict[str, Any]:
    quiz = load_quiz()
    return {
        "title": quiz.title,
        "blocks": [
            {
                "id": block.id,
                "title": block.title,
                "description": block.description,
                "questionCount": len(block.questions),
            }
            for block in quiz.blocks
        ],
    }


@app.post("/api/teams")
def create_team(payload: TeamCreateRequest) -> dict[str, Any]:
    team_id = new_id("team")
    participant_id = new_id("participant")
    token = secrets.token_urlsafe(32)

    with connect() as conn:
        for _ in range(20):
            code = generate_team_code()
            exists = conn.execute("SELECT 1 FROM teams WHERE code = ?", (code,)).fetchone()
            if not exists:
                break
        else:
            raise HTTPException(status_code=500, detail="Could not generate team code")

        conn.execute("INSERT INTO teams (id, name, code) VALUES (?, ?, ?)", (team_id, payload.teamName.strip(), code))
        conn.execute(
            """
            INSERT INTO participants (id, team_id, display_name, role, session_token)
            VALUES (?, ?, ?, 'captain', ?)
            """,
            (participant_id, team_id, payload.captainName.strip(), token),
        )

    return {
        "teamId": team_id,
        "teamName": payload.teamName.strip(),
        "teamCode": code,
        "participantId": participant_id,
        "role": "captain",
        "sessionToken": token,
    }


@app.post("/api/teams/join")
def join_team(payload: TeamJoinRequest) -> dict[str, Any]:
    participant_id = new_id("participant")
    token = secrets.token_urlsafe(32)

    with connect() as conn:
        team = conn.execute("SELECT * FROM teams WHERE code = ?", (payload.teamCode.strip(),)).fetchone()
        if not team:
            raise HTTPException(status_code=404, detail="Team code not found")
        conn.execute(
            """
            INSERT INTO participants (id, team_id, display_name, role, session_token)
            VALUES (?, ?, ?, 'member', ?)
            """,
            (participant_id, team["id"], payload.displayName.strip(), token),
        )

    return {
        "teamId": team["id"],
        "teamName": team["name"],
        "teamCode": team["code"],
        "participantId": participant_id,
        "role": "member",
        "sessionToken": token,
    }


@app.get("/api/team/state")
def team_state(participant: dict = Depends(require_participant)) -> dict[str, Any]:
    state = game_state()
    block, questions = active_block_and_questions(state, include_answers=state["phase"] == "answers_revealed")
    visible_ids = [question["id"] for question in questions]

    with connect() as conn:
        answer_rows = conn.execute(
            f"""
            SELECT a.question_id, a.answer, s.is_correct, s.points_awarded
            FROM answers a
            LEFT JOIN scores s ON s.team_id = a.team_id AND s.question_id = a.question_id
            WHERE a.team_id = ? AND a.question_id IN ({",".join("?" for _ in visible_ids) or "NULL"})
            """,
            (participant["team_id"], *visible_ids),
        ).fetchall()

    answers = {
        row["question_id"]: {
            "answer": row["answer"],
            "isCorrect": bool(row["is_correct"]) if row["is_correct"] is not None else None,
            "pointsAwarded": row["points_awarded"],
        }
        for row in answer_rows
    }

    return {
        "team": {
            "id": participant["team_id"],
            "name": participant["team_name"],
            "code": participant["team_code"],
            "role": participant["role"],
        },
        "game": {
            "phase": state["phase"],
            "activeBlock": None if not block else {"id": block.id, "title": block.title, "description": block.description},
            "visibleQuestionCount": state["visible_question_count"],
            "questions": questions,
            "canEditAnswers": participant["role"] == "captain" and block_is_editable(state),
        },
        "answers": answers,
        "scoreboard": scoreboard(),
    }


@app.post("/api/team/answers")
def upsert_answer(payload: AnswerUpsertRequest, participant: dict = Depends(require_participant)) -> dict[str, Any]:
    if participant["role"] != "captain":
        raise HTTPException(status_code=403, detail="Only the team captain can submit answers")

    state = game_state()
    if not block_is_editable(state):
        raise HTTPException(status_code=409, detail="This block is not open for answers")

    block = load_quiz().block_by_id(state["active_block_id"])
    visible_questions = block.questions[: state["visible_question_count"]]
    if payload.questionId not in {question.id for question in visible_questions}:
        raise HTTPException(status_code=400, detail="Question is not visible")

    with connect() as conn:
        conn.execute(
            """
            INSERT INTO answers (team_id, question_id, answer, submitted_by_participant_id, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(team_id, question_id) DO UPDATE SET
                answer = excluded.answer,
                submitted_by_participant_id = excluded.submitted_by_participant_id,
                updated_at = CURRENT_TIMESTAMP
            """,
            (participant["team_id"], payload.questionId, payload.answer, participant["id"]),
        )

    return {"status": "saved"}


@app.get("/api/admin/state", dependencies=[Depends(require_admin)])
def admin_state() -> dict[str, Any]:
    state = game_state()
    quiz = load_quiz()
    block, questions = active_block_and_questions(state, include_answers=True)
    return {
        "quiz": {
            "title": quiz.title,
            "blocks": [
                {
                    "id": item.id,
                    "title": item.title,
                    "description": item.description,
                    "questionCount": len(item.questions),
                }
                for item in quiz.blocks
            ],
        },
        "game": {
            "phase": state["phase"],
            "activeBlock": None if not block else {"id": block.id, "title": block.title, "description": block.description},
            "visibleQuestionCount": state["visible_question_count"],
            "questions": [load_quiz().question_by_id(question["id"]).admin_dict() for question in questions],
        },
        "teams": all_teams(),
        "scoreboard": scoreboard(),
    }


@app.post("/api/admin/open-block", dependencies=[Depends(require_admin)])
def open_block(payload: OpenBlockRequest) -> dict[str, Any]:
    block = load_quiz().block_by_id(payload.blockId)
    with connect() as conn:
        conn.execute(
            """
            UPDATE game_state
            SET phase = 'block_open',
                active_block_id = ?,
                visible_question_count = ?,
                revealed_block_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """,
            (block.id, 1 if block.questions else 0),
        )
    return {"status": "opened", "blockId": block.id}


@app.post("/api/admin/release-next-question", dependencies=[Depends(require_admin)])
def release_next_question() -> dict[str, Any]:
    state = game_state()
    if not state["active_block_id"]:
        raise HTTPException(status_code=409, detail="No active block")
    block = load_quiz().block_by_id(state["active_block_id"])
    next_count = min(state["visible_question_count"] + 1, len(block.questions))
    with connect() as conn:
        conn.execute(
            """
            UPDATE game_state
            SET phase = 'block_open',
                visible_question_count = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """,
            (next_count,),
        )
    return {"status": "released", "visibleQuestionCount": next_count}


@app.post("/api/admin/visible-question-count", dependencies=[Depends(require_admin)])
def set_visible_question_count(payload: SetVisibleQuestionCountRequest) -> dict[str, Any]:
    state = game_state()
    if not state["active_block_id"]:
        raise HTTPException(status_code=409, detail="No active block")
    block = load_quiz().block_by_id(state["active_block_id"])
    count = min(payload.visibleQuestionCount, len(block.questions))
    with connect() as conn:
        conn.execute(
            """
            UPDATE game_state
            SET visible_question_count = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """,
            (count,),
        )
    return {"status": "updated", "visibleQuestionCount": count}


@app.post("/api/admin/close-block", dependencies=[Depends(require_admin)])
def close_block() -> dict[str, Any]:
    with connect() as conn:
        conn.execute("UPDATE game_state SET phase = 'block_closed', updated_at = CURRENT_TIMESTAMP WHERE id = 1")
    return {"status": "closed"}


@app.post("/api/admin/set-phase", dependencies=[Depends(require_admin)])
def set_phase(payload: SetPhaseRequest) -> dict[str, str]:
    with connect() as conn:
        conn.execute(
            "UPDATE game_state SET phase = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
            (payload.phase,),
        )
    return {"status": "updated", "phase": payload.phase}


@app.get("/api/admin/review/{block_id}", dependencies=[Depends(require_admin)])
def review_block(block_id: str) -> dict[str, Any]:
    block = load_quiz().block_by_id(block_id)
    question_ids = [question.id for question in block.questions]
    with connect() as conn:
        teams = conn.execute("SELECT id, name FROM teams ORDER BY created_at").fetchall()
        rows = conn.execute(
            f"""
            SELECT a.team_id, a.question_id, a.answer, s.is_correct, s.points_awarded
            FROM answers a
            LEFT JOIN scores s ON s.team_id = a.team_id AND s.question_id = a.question_id
            WHERE a.question_id IN ({",".join("?" for _ in question_ids) or "NULL"})
            """,
            question_ids,
        ).fetchall()

    answer_map = {(row["team_id"], row["question_id"]): dict(row) for row in rows}
    return {
        "block": {
            "id": block.id,
            "title": block.title,
            "questions": [question.admin_dict() for question in block.questions],
        },
        "teams": [
            {
                "id": team["id"],
                "name": team["name"],
                "answers": {
                    question.id: answer_map.get(
                        (team["id"], question.id),
                        {"answer": "", "is_correct": None, "points_awarded": None},
                    )
                    for question in block.questions
                },
            }
            for team in teams
        ],
    }


@app.post("/api/admin/submit-scores", dependencies=[Depends(require_admin)])
def submit_scores(payload: SubmitScoresRequest) -> dict[str, Any]:
    block = load_quiz().block_by_id(payload.blockId)
    question_ids = {question.id for question in block.questions}

    with connect() as conn:
        for item in payload.scores:
            if item.questionId not in question_ids:
                raise HTTPException(status_code=400, detail=f"Question {item.questionId} is not in block {block.id}")
            conn.execute(
                """
                INSERT INTO scores (team_id, question_id, block_id, is_correct, points_awarded, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(team_id, question_id) DO UPDATE SET
                    is_correct = excluded.is_correct,
                    points_awarded = excluded.points_awarded,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (item.teamId, item.questionId, block.id, int(item.isCorrect), 1 if item.isCorrect else 0),
            )

        conn.execute(
            """
            UPDATE game_state
            SET phase = 'answers_revealed',
                scoring_submitted_block_id = ?,
                revealed_block_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """,
            (block.id, block.id),
        )

    return {"status": "scores_saved", "scoreboard": scoreboard()}


@app.post("/api/admin/reset", dependencies=[Depends(require_admin)])
def reset_game() -> dict[str, str]:
    with connect() as conn:
        conn.execute("DELETE FROM scores")
        conn.execute("DELETE FROM answers")
        conn.execute("DELETE FROM participants")
        conn.execute("DELETE FROM teams")
        conn.execute(
            """
            UPDATE game_state
            SET phase = 'lobby',
                active_block_id = NULL,
                visible_question_count = 0,
                revealed_block_id = NULL,
                scoring_submitted_block_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """
        )
    return {"status": "reset"}
