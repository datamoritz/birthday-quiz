export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://birthday-quiz-api.moritzknodler.com";
export const DEFAULT_MASTER_TOKEN = process.env.NEXT_PUBLIC_MASTER_TOKEN || "2904";

type RequestOptions = {
  token?: string;
  body?: unknown;
  method?: "GET" | "POST";
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || (options.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = payload?.detail || payload?.error || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export type Question = {
  id: string;
  type: "text" | "multiple_choice" | "song_artist";
  prompt: string;
  options?: string[];
  media?: {
    type: "image" | "video";
    src: string;
    alt?: string;
  };
  masterNote?: string | null;
  correctAnswer?: string | null;
  acceptedAnswers?: string[];
};

export type ScoreboardItem = {
  id: string;
  name: string;
  score: number;
};

export type TeamSession = {
  teamId: string;
  teamName: string;
  teamCode: string;
  participantId: string;
  role: "captain" | "member";
  sessionToken: string;
};

export type TeamState = {
  team: {
    id: string;
    name: string;
    code: string;
    role: "captain" | "member";
  };
  game: {
    phase: string;
    activeBlock: null | { id: string; title: string; description?: string | null };
    visibleQuestionCount: number;
    questions: Question[];
    canEditAnswers: boolean;
  };
  answers: Record<
    string,
    {
      answer: string;
      isCorrect: boolean | null;
      pointsAwarded: number | null;
    }
  >;
  scoreboard: ScoreboardItem[];
};

export type AdminState = {
  quiz: {
    title: string;
    blocks: Array<{ id: string; title: string; description?: string | null; questionCount: number }>;
  };
  game: {
    phase: string;
    activeBlock: null | { id: string; title: string; description?: string | null };
    visibleQuestionCount: number;
    questions: Question[];
  };
  teams: Array<{ id: string; name: string; code: string; participant_count: number }>;
  scoreboard: ScoreboardItem[];
};

export type ReviewState = {
  block: {
    id: string;
    title: string;
    questions: Question[];
  };
  teams: Array<{
    id: string;
    name: string;
    answers: Record<
      string,
      {
        team_id?: string;
        question_id?: string;
        answer: string;
        is_correct: number | boolean | null;
        points_awarded: number | null;
      }
    >;
  }>;
};
