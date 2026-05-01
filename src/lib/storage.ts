// Local storage wrapper for quiz progress and spaced repetition.

export interface PassageRecord {
  // Stable id we use to dedupe what the user has already seen.
  // Format: "{authorId}-{bookId}-{hash8}".
  id: string;
  authorId: string;
  authorName: string;
  passage: string;
  bookId: number;
  bookTitle: string | null;
  gutenbergUrl: string;
}

export interface QuizAttempt {
  date: string;
  passageId: string;
  authorId: string;
  authorCorrect: boolean;
  movementCorrect: boolean;
}

export interface DailyQuizResult {
  date: string;
  totalQuestions: number;
  authorCorrect: number;
  movementCorrect: number;
  attempts: QuizAttempt[];
}

export interface AuthorWeight {
  authorId: string;
  weight: number;
  timesShown: number;
  timesAuthorCorrect: number;
  timesMovementCorrect: number;
  lastShown: string | null;
}

export interface UserProgress {
  streak: number;
  lastQuizDate: string | null;
  totalQuizzes: number;
  authorWeights: Record<string, AuthorWeight>;
  quizHistory: DailyQuizResult[];
  seenPassages: string[];
}

const STORAGE_KEY = "lit-quiz-progress";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getProgress(): UserProgress {
  if (!isBrowser()) return defaultProgress();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    return JSON.parse(raw);
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(progress: UserProgress): void {
  if (!isBrowser()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function defaultProgress(): UserProgress {
  return {
    streak: 0,
    lastQuizDate: null,
    totalQuizzes: 0,
    authorWeights: {},
    quizHistory: [],
    seenPassages: [],
  };
}

export function getAuthorWeight(
  progress: UserProgress,
  authorId: string
): AuthorWeight {
  return (
    progress.authorWeights[authorId] || {
      authorId,
      weight: 5,
      timesShown: 0,
      timesAuthorCorrect: 0,
      timesMovementCorrect: 0,
      lastShown: null,
    }
  );
}

export function updateWeightAfterAttempt(
  progress: UserProgress,
  authorId: string,
  authorCorrect: boolean,
  movementCorrect: boolean
): void {
  const w = getAuthorWeight(progress, authorId);
  w.timesShown++;
  if (authorCorrect) w.timesAuthorCorrect++;
  if (movementCorrect) w.timesMovementCorrect++;
  w.lastShown = new Date().toISOString();

  if (authorCorrect && movementCorrect) {
    w.weight = Math.max(1, w.weight - 1);
  } else if (!authorCorrect && !movementCorrect) {
    w.weight = Math.min(10, w.weight + 2);
  } else {
    w.weight = Math.min(10, w.weight + 1);
  }

  progress.authorWeights[authorId] = w;
}

export function updateStreak(progress: UserProgress): void {
  const today = new Date().toISOString().split("T")[0];
  if (progress.lastQuizDate === today) return;

  const yesterday = new Date(Date.now() - 86400000)
    .toISOString()
    .split("T")[0];
  if (progress.lastQuizDate === yesterday) {
    progress.streak++;
  } else {
    progress.streak = 1;
  }
  progress.lastQuizDate = today;
  progress.totalQuizzes++;
}

export function hasQuizzedToday(progress: UserProgress): boolean {
  const today = new Date().toISOString().split("T")[0];
  return progress.lastQuizDate === today;
}

// Cheap hash so the same passage ID is stable across sessions.
export function hashPassage(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).padStart(8, "0").slice(0, 8);
}
