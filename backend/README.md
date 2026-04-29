# Birthday Quiz Backend

FastAPI backend for a block-based birthday quiz.

## Local Run

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Open:

```txt
http://localhost:8000/docs
```

## Game Model

- One active game.
- The admin/master controls blocks, question release, closing, review, reveal, and scoreboard.
- Teams are created freely by a Team Captain.
- Team Members join using a team code.
- Only the Team Captain can submit/edit answers.
- A captain can edit any visible answer until the whole block is closed.
- Everyone can see the scoreboard at all times.
- Teams see their own answer correctness after scores are submitted or answers are revealed.

## Deployment Target

Recommended isolated server path:

```txt
/opt/birthday-quiz-api
```

No server files should be created or changed without explicit approval.
