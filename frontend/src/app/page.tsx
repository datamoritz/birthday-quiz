"use client";

import {
  Check,
  ChevronRight,
  Eye,
  Lock,
  PanelTopOpen,
  Play,
  RefreshCw,
  Save,
  Shield,
  Trophy,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  AdminState,
  API_BASE_URL,
  DEFAULT_MASTER_TOKEN,
  Question,
  ReviewState,
  ScoreboardItem,
  TeamSession,
  TeamState,
  apiRequest,
} from "@/lib/api";

type Mode = "team" | "master";
type Toast = { message: string; tone?: "ok" | "error" } | null;

const SESSION_KEY = "birthday-quiz-team-session";
const ADMIN_TOKEN_KEY = "birthday-quiz-admin-token";

function mediaUrl(src: string): string {
  if (src.startsWith("http://") || src.startsWith("https://")) {
    return src;
  }
  return `${API_BASE_URL}${src}`;
}

function phaseLabel(phase: string): string {
  return phase.replaceAll("_", " ");
}

function parseSongArtistAnswer(answer: string): { song: string; artist: string } {
  if (!answer) return { song: "", artist: "" };
  try {
    const parsed = JSON.parse(answer) as { song?: unknown; artist?: unknown };
    return {
      song: typeof parsed.song === "string" ? parsed.song : "",
      artist: typeof parsed.artist === "string" ? parsed.artist : "",
    };
  } catch {
    return { song: answer, artist: "" };
  }
}

function songArtistAnswer(song: string, artist: string): string {
  return JSON.stringify({ song, artist });
}

function displayAnswer(answer: string, question: Question): string {
  if (question.type !== "song_artist") return answer;
  const parsed = parseSongArtistAnswer(answer);
  if (parsed.song || parsed.artist) {
    return [parsed.song && `Song: ${parsed.song}`, parsed.artist && `Artist: ${parsed.artist}`].filter(Boolean).join(" / ");
  }
  return answer;
}

export default function Home() {
  const pathname = usePathname();
  const mode: Mode = pathname.toLowerCase().startsWith("/master") ? "master" : "team";
  const [toast, setToast] = useState<Toast>(null);

  function showToast(message: string, tone: "ok" | "error" = "ok") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3200);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>Birthday Quiz</strong>
          <span>{API_BASE_URL}</span>
        </div>
      </header>

      {mode === "team" ? <TeamApp showToast={showToast} /> : <MasterApp showToast={showToast} />}

      {toast ? <div className="toast">{toast.message}</div> : null}
    </main>
  );
}

function Scoreboard({ items }: { items: ScoreboardItem[] }) {
  return (
    <aside className="scoreboard">
      <div className="panel-header">
        <div>
          <h3>Scoreboard</h3>
          <span className="tiny">Visible all night</span>
        </div>
        <Trophy size={20} />
      </div>
      {items.length ? (
        <div>
          {items.map((team, index) => (
            <div className="score-row" key={team.id}>
              <span className="mono">{index + 1}</span>
              <strong>{team.name}</strong>
              <span className="mono">{team.score}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">No teams yet.</div>
      )}
    </aside>
  );
}

function TeamApp({ showToast }: { showToast: (message: string, tone?: "ok" | "error") => void }) {
  const [session, setSession] = useState<TeamSession | null>(null);
  const [state, setState] = useState<TeamState | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const nextState = await apiRequest<TeamState>("/api/team/state", { token: session.sessionToken });
      setState(nextState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not refresh team state", "error");
    }
  }, [session, showToast]);

  useEffect(() => {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw) {
      setSession(JSON.parse(raw));
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    refresh();
    const timer = window.setInterval(refresh, 1800);
    return () => window.clearInterval(timer);
  }, [refresh, session]);

  async function createTeam(payload: { teamName: string; captainName: string }) {
    setLoading(true);
    try {
      const nextSession = await apiRequest<TeamSession>("/api/teams", { body: payload });
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      showToast("Team created.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create team", "error");
    } finally {
      setLoading(false);
    }
  }

  async function joinTeam(payload: { teamCode: string; displayName: string }) {
    setLoading(true);
    try {
      const nextSession = await apiRequest<TeamSession>("/api/teams/join", { body: payload });
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      showToast("Joined team.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not join team", "error");
    } finally {
      setLoading(false);
    }
  }

  function leaveTeam() {
    window.localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setState(null);
  }

  return (
    <section className={`main-grid ${state ? "" : "single"}`}>
      <div className="stack">
        {!session ? (
          <TeamEntry loading={loading} onCreate={createTeam} onJoin={joinTeam} />
        ) : (
          <TeamRoom session={session} state={state} onRefresh={refresh} onLeave={leaveTeam} showToast={showToast} />
        )}
      </div>
      {state ? <Scoreboard items={state.scoreboard} /> : null}
    </section>
  );
}

function TeamEntry({
  loading,
  onCreate,
  onJoin,
}: {
  loading: boolean;
  onCreate: (payload: { teamName: string; captainName: string }) => void;
  onJoin: (payload: { teamCode: string; displayName: string }) => void;
}) {
  const [teamName, setTeamName] = useState("");
  const [teamCode, setTeamCode] = useState("");

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    onCreate({ teamName, captainName: "Captain" });
  }

  function submitJoin(event: FormEvent) {
    event.preventDefault();
    onJoin({ teamCode, displayName: "Team Member" });
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h1>Join the quiz</h1>
          <span className="tiny">Create a team as captain, or join with the code on your table.</span>
        </div>
      </div>
      <div className="form-grid">
        <form className="stack" onSubmit={submitCreate}>
          <h2>Team Captain</h2>
          <div className="field">
            <label htmlFor="teamName">Team name</label>
            <input id="teamName" className="input" value={teamName} onChange={(event) => setTeamName(event.target.value)} required />
          </div>
          <button className="button" disabled={loading} type="submit">
            <UserPlus size={17} /> Create team
          </button>
        </form>

        <form className="stack" onSubmit={submitJoin}>
          <h2>Team Member</h2>
          <div className="field">
            <label htmlFor="teamCode">Team code</label>
            <input
              id="teamCode"
              className="input mono"
              value={teamCode}
              onChange={(event) => setTeamCode(event.target.value)}
              required
            />
          </div>
          <button className="button secondary" disabled={loading} type="submit">
            <Eye size={17} /> Join team
          </button>
        </form>
      </div>
    </div>
  );
}

function TeamRoom({
  session,
  state,
  onRefresh,
  onLeave,
  showToast,
}: {
  session: TeamSession;
  state: TeamState | null;
  onRefresh: () => void;
  onLeave: () => void;
  showToast: (message: string, tone?: "ok" | "error") => void;
}) {
  const isCaptain = session.role === "captain";

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h1>{session.teamName}</h1>
            <div className="status-row">
              <span className="badge">Code <span className="mono">{session.teamCode}</span></span>
              <span className="badge">{isCaptain ? "Captain" : "Member"}</span>
              {state ? <span className="badge warning">{phaseLabel(state.game.phase)}</span> : null}
            </div>
          </div>
          <div className="actions">
            <button className="icon-button" onClick={onRefresh} title="Refresh" type="button">
              <RefreshCw size={17} />
            </button>
            <button className="button secondary" onClick={onLeave} type="button">
              Leave
            </button>
          </div>
        </div>
        {!isCaptain ? <p className="tiny">You can follow along and see your team answers. The captain submits.</p> : null}
      </div>

      {!state ? (
        <div className="empty">Loading game state...</div>
      ) : state.game.questions.length ? (
        <div className="question-list">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h1>{state.game.activeBlock?.title}</h1>
                <span className="tiny">
                  {state.game.canEditAnswers ? "Answers are open." : "Answers are locked or waiting."}
                </span>
              </div>
              {state.game.canEditAnswers ? <span className="badge success">editable</span> : <span className="badge"><Lock size={14} /> locked</span>}
            </div>
          </div>
          {state.game.questions.map((question, index) => (
            <TeamQuestion
              answer={state.answers[question.id]?.answer || ""}
              canEdit={state.game.canEditAnswers}
              index={index}
              key={question.id}
              question={question}
              result={state.answers[question.id]}
              token={session.sessionToken}
              showToast={showToast}
            />
          ))}
        </div>
      ) : (
        <div className="empty">Waiting for the master to open the next block.</div>
      )}
    </>
  );
}

function TeamQuestion({
  question,
  index,
  answer,
  canEdit,
  result,
  token,
  showToast,
}: {
  question: Question;
  index: number;
  answer: string;
  canEdit: boolean;
  result?: { answer: string; isCorrect: boolean | null; pointsAwarded: number | null };
  token: string;
  showToast: (message: string, tone?: "ok" | "error") => void;
}) {
  const [value, setValue] = useState(answer);
  const [saving, setSaving] = useState(false);
  const songArtist = parseSongArtistAnswer(value);

  useEffect(() => setValue(answer), [answer]);

  async function save(nextValue = value) {
    setSaving(true);
    try {
      await apiRequest("/api/team/answers", {
        token,
        body: { questionId: question.id, answer: nextValue },
      });
      showToast("Answer saved.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save answer", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="question-card">
      <div className="question-top">
        <h3 className="question-title">
          {index + 1}. {question.prompt}
        </h3>
        {result?.isCorrect === true ? <span className="badge success">correct</span> : null}
        {result?.isCorrect === false ? <span className="badge danger">wrong</span> : null}
      </div>

      <QuestionMedia question={question} />

      {question.type === "multiple_choice" && question.options?.length ? (
        <div className="option-grid">
          {question.options.map((option) => (
            <button
              className={`option-button ${value === option ? "selected" : ""}`}
              disabled={!canEdit || saving}
              key={option}
              onClick={() => {
                setValue(option);
                save(option);
              }}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      ) : question.type === "song_artist" ? (
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`${question.id}-song`}>Song</label>
            <input
              id={`${question.id}-song`}
              className="input"
              disabled={!canEdit}
              value={songArtist.song}
              onChange={(event) => setValue(songArtistAnswer(event.target.value, songArtist.artist))}
            />
          </div>
          <div className="field">
            <label htmlFor={`${question.id}-artist`}>Artist</label>
            <input
              id={`${question.id}-artist`}
              className="input"
              disabled={!canEdit}
              value={songArtist.artist}
              onChange={(event) => setValue(songArtistAnswer(songArtist.song, event.target.value))}
            />
          </div>
        </div>
      ) : (
        <div className="field">
          <label htmlFor={question.id}>Answer</label>
          <textarea
            id={question.id}
            className="textarea"
            disabled={!canEdit}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
      )}

      <div className="actions" style={{ marginTop: 10 }}>
        {question.type !== "multiple_choice" ? (
          <button className="button" disabled={!canEdit || saving} onClick={() => save()} type="button">
            <Save size={17} /> Save
          </button>
        ) : null}
        {result?.pointsAwarded != null ? <span className="badge success">{result.pointsAwarded} point</span> : null}
        {question.correctAnswer ? <span className="badge">Answer: {question.correctAnswer}</span> : null}
      </div>
    </article>
  );
}

function QuestionMedia({ question }: { question: Question }) {
  if (!question.media) return null;
  return (
    <div className="media-frame">
      {question.media.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={question.media.alt || ""} src={mediaUrl(question.media.src)} />
      ) : (
        <video controls src={mediaUrl(question.media.src)} />
      )}
    </div>
  );
}

function MasterApp({ showToast }: { showToast: (message: string, tone?: "ok" | "error") => void }) {
  const [token, setToken] = useState(DEFAULT_MASTER_TOKEN);
  const [adminState, setAdminState] = useState<AdminState | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [busy, setBusy] = useState(false);

  const activeBlockId = adminState?.game.activeBlock?.id;

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const next = await apiRequest<AdminState>("/api/admin/state", { token });
      setAdminState(next);
      if (next.game.activeBlock?.id && ["block_closed", "review", "answers_revealed"].includes(next.game.phase)) {
        const nextReview = await apiRequest<ReviewState>(`/api/admin/review/${next.game.activeBlock.id}`, { token });
        setReview(nextReview);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not refresh master state", "error");
    }
  }, [showToast, token]);

  useEffect(() => {
    setToken(DEFAULT_MASTER_TOKEN);
    window.localStorage.setItem(ADMIN_TOKEN_KEY, DEFAULT_MASTER_TOKEN);
  }, []);

  useEffect(() => {
    if (!token) return;
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
  }, [refresh, token]);

  async function adminAction(path: string, body?: unknown) {
    setBusy(true);
    try {
      await apiRequest(path, { token, body, method: "POST" });
      await refresh();
      showToast("Master control updated.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function loadReview(blockId = activeBlockId) {
    if (!blockId) return;
    try {
      const nextReview = await apiRequest<ReviewState>(`/api/admin/review/${blockId}`, { token });
      setReview(nextReview);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load review", "error");
    }
  }

  return (
    <section className="main-grid">
      <div className="stack">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h1>Master Control</h1>
              <span className="tiny">Open blocks, release questions, close answers, and submit scores.</span>
            </div>
            <div className="actions">
              <button className="icon-button" onClick={refresh} title="Refresh" type="button">
                <RefreshCw size={17} />
              </button>
              <button className="button danger" disabled={busy} onClick={() => adminAction("/api/admin/reset")} type="button">
                <X size={17} /> Reset entire game
              </button>
            </div>
          </div>
        </div>

        {adminState ? (
          <>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Game State</h2>
                  <div className="status-row">
                    <span className="badge warning">{phaseLabel(adminState.game.phase)}</span>
                    {adminState.game.activeBlock ? <span className="badge">{adminState.game.activeBlock.title}</span> : null}
                    <span className="badge">{adminState.teams.length} teams</span>
                  </div>
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="blockSelect">Open block</label>
                  <select
                    id="blockSelect"
                    className="select"
                    onChange={(event) => event.target.value && adminAction("/api/admin/open-block", { blockId: event.target.value })}
                    value={adminState.game.activeBlock?.id || ""}
                    disabled={busy}
                  >
                    <option value="">Choose a block</option>
                    {adminState.quiz.blocks.map((block) => (
                      <option key={block.id} value={block.id}>
                        {block.title} ({block.questionCount})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Controls</label>
                  <div className="actions">
                    <button className="button" disabled={busy || !activeBlockId} onClick={() => adminAction("/api/admin/release-next-question")} type="button">
                      <ChevronRight size={17} /> Release next
                    </button>
                    <button className="button secondary" disabled={busy || !activeBlockId} onClick={() => adminAction("/api/admin/close-block")} type="button">
                      <Lock size={17} /> Close block
                    </button>
                    <button className="button secondary" disabled={!activeBlockId} onClick={() => loadReview()} type="button">
                      <PanelTopOpen size={17} /> Review
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <VisibleQuestions state={adminState} />
            {review ? <ReviewPanel review={review} token={token} onDone={refresh} showToast={showToast} /> : null}
          </>
        ) : (
          <div className="empty">Connecting to the master controls...</div>
        )}
      </div>
      <Scoreboard items={adminState?.scoreboard || []} />
    </section>
  );
}

function VisibleQuestions({ state }: { state: AdminState }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h1>{state.game.activeBlock?.title || "Visible Questions"}</h1>
          <span className="tiny">{state.game.visibleQuestionCount} currently visible to teams</span>
        </div>
      </div>
      {state.game.questions.length ? (
        <div className="question-list">
          {state.game.questions.map((question, index) => (
            <article className="question-card" key={question.id}>
              <div className="question-top">
                <h3 className="question-title">
                  {index + 1}. {question.prompt}
                </h3>
                <span className="badge">{question.type}</span>
              </div>
              <QuestionMedia question={question} />
              {question.options?.length ? <p className="tiny">{question.options.join(" / ")}</p> : null}
              {question.masterNote ? <MasterNote text={question.masterNote} /> : null}
              {question.correctAnswer ? <span className="badge success">Answer: {question.correctAnswer}</span> : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">No questions visible yet.</div>
      )}
    </div>
  );
}

function ReviewPanel({
  review,
  token,
  onDone,
  showToast,
}: {
  review: ReviewState;
  token: string;
  onDone: () => void;
  showToast: (message: string, tone?: "ok" | "error") => void;
}) {
  const initial = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const team of review.teams) {
      for (const question of review.block.questions) {
        map[`${team.id}:${question.id}`] = Boolean(team.answers[question.id]?.is_correct);
      }
    }
    return map;
  }, [review]);
  const [checks, setChecks] = useState<Record<string, boolean>>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => setChecks(initial), [initial]);

  function toggle(teamId: string, questionId: string) {
    const key = `${teamId}:${questionId}`;
    setChecks((current) => ({ ...current, [key]: !current[key] }));
  }

  async function submitScores() {
    setSaving(true);
    try {
      await apiRequest("/api/admin/submit-scores", {
        token,
        body: {
          blockId: review.block.id,
          scores: review.teams.flatMap((team) =>
            review.block.questions.map((question) => ({
              teamId: team.id,
              questionId: question.id,
              isCorrect: Boolean(checks[`${team.id}:${question.id}`]),
            })),
          ),
        },
      });
      showToast("Scores submitted.");
      onDone();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not submit scores", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Review: {review.block.title}</h2>
          <span className="tiny">Click checkmarks, then submit scores for this block.</span>
        </div>
        <button className="button" disabled={saving} onClick={submitScores} type="button">
          <Play size={17} /> Submit scores
        </button>
      </div>

      <div className="review-table-wrap">
        <table className="review-table">
          <thead>
            <tr>
              <th>Team</th>
              {review.block.questions.map((question, index) => (
                <th key={question.id}>
                  Q{index + 1}
                  {question.correctAnswer ? <div className="tiny">{question.correctAnswer}</div> : null}
                  {question.masterNote ? <div className="tiny">Master note: {question.masterNote}</div> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {review.teams.map((team) => (
              <tr key={team.id}>
                <th>{team.name}</th>
                {review.block.questions.map((question) => (
                  <td key={question.id}>
                    <div className="answer-cell">
                      <span>{displayAnswer(team.answers[question.id]?.answer || "", question) || "No answer"}</span>
                      <button
                        className={`check-toggle ${checks[`${team.id}:${question.id}`] ? "checked" : ""}`}
                        onClick={() => toggle(team.id, question.id)}
                        title="Toggle correct"
                        type="button"
                      >
                        {checks[`${team.id}:${question.id}`] ? <Check size={18} /> : <X size={18} />}
                      </button>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MasterNote({ text }: { text: string }) {
  return (
    <div className="master-note">
      <strong>Master note</strong>
      <p>{text}</p>
    </div>
  );
}
