"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getProgress, hasQuizzedToday, type UserProgress } from "@/lib/storage";
import { AUTHORS, MOVEMENTS, getMovementById } from "@/lib/authors";
import ProgressRing from "@/components/ProgressRing";

export default function HomePage() {
  const router = useRouter();
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setProgress(getProgress());
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-vellum flex items-center justify-center">
        <div className="w-16 h-20 shimmer rounded" />
      </div>
    );
  }

  const quizzedToday = progress ? hasQuizzedToday(progress) : false;
  const totalAuthors = AUTHORS.length;
  const seenAuthors = progress
    ? new Set(
        progress.quizHistory.flatMap((q) => q.attempts.map((a) => a.authorId))
      ).size
    : 0;
  const totalQuizzes = progress?.totalQuizzes || 0;

  const totalAttempts = progress
    ? progress.quizHistory.reduce((sum, q) => sum + q.attempts.length, 0)
    : 0;
  const totalCorrectAuthor = progress
    ? progress.quizHistory.reduce((sum, q) => sum + q.authorCorrect, 0)
    : 0;
  const totalCorrectMovement = progress
    ? progress.quizHistory.reduce((sum, q) => sum + q.movementCorrect, 0)
    : 0;
  const overallAccuracy =
    totalAttempts > 0
      ? Math.round(
          ((totalCorrectAuthor + totalCorrectMovement) / (totalAttempts * 2)) *
            100
        )
      : 0;

  const lastQuiz =
    progress && progress.quizHistory.length > 0
      ? progress.quizHistory[progress.quizHistory.length - 1]
      : null;

  const movementStats: Record<string, { correct: number; total: number }> = {};
  if (progress) {
    for (const quiz of progress.quizHistory) {
      for (const attempt of quiz.attempts) {
        const author = AUTHORS.find((a) => a.id === attempt.authorId);
        if (!author) continue;
        if (!movementStats[author.movement]) {
          movementStats[author.movement] = { correct: 0, total: 0 };
        }
        movementStats[author.movement].total++;
        if (attempt.movementCorrect) movementStats[author.movement].correct++;
      }
    }
  }

  const movementEntries = Object.entries(movementStats)
    .map(([id, stats]) => ({
      movement: getMovementById(id),
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      total: stats.total,
    }))
    .filter((e) => e.movement)
    .sort((a, b) => a.accuracy - b.accuracy);

  return (
    <div className="min-h-screen bg-vellum">
      {/* Hero */}
      <header className="relative overflow-hidden bg-spine text-vellum">
        <div className="absolute inset-0 opacity-[0.06]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(246,241,232,0.4) 4px, rgba(246,241,232,0.4) 5px)",
            }}
          />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 py-12 sm:py-16">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-0.5 bg-rubric" />
            <span className="text-rubric text-xs uppercase tracking-[0.2em] font-medium">
              Daily Literature Quiz
            </span>
          </div>
          <h1
            className="text-5xl sm:text-6xl mb-3 text-vellum"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
          >
            Anthologie
          </h1>
          <p className="text-vellum/70 max-w-md text-base leading-relaxed">
            Train your ear for prose. From Defoe to the early Modernists —
            three centuries of literature, one passage at a time.
          </p>

          {progress && progress.streak > 0 && (
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full">
              <span className="streak-flame">&#128293;</span>
              <span className="text-sm text-vellum/90 font-medium">
                {progress.streak} day streak
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Daily quiz card */}
        <div
          className="library-card p-6 cursor-pointer group"
          onClick={() => router.push("/quiz")}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {quizzedToday && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-correct-light text-correct font-medium">
                    Completed
                  </span>
                )}
              </div>
              <h2 className="text-2xl mb-1 group-hover:text-rubric-dark transition-colors">
                {quizzedToday ? "Read Again" : "Today's Reading"}
              </h2>
              <p className="text-ink-muted text-sm">
                10 passages &middot; ~6 minutes &middot; Author + Movement
              </p>
            </div>
            <div className="w-14 h-14 rounded-full bg-ink flex items-center justify-center group-hover:bg-spine transition-colors flex-shrink-0">
              <svg
                className="w-6 h-6 text-vellum"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </div>
          </div>
        </div>

        {totalQuizzes > 0 && (
          <div>
            <h2 className="text-xl mb-4">Your Progress</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="library-card p-4 text-center">
                <p className="text-2xl font-semibold text-ink">{totalQuizzes}</p>
                <p className="text-xs text-ink-muted mt-1">Quizzes Taken</p>
              </div>
              <div className="library-card p-4 text-center">
                <p className="text-2xl font-semibold text-ink">
                  {seenAuthors}/{totalAuthors}
                </p>
                <p className="text-xs text-ink-muted mt-1">Authors Seen</p>
              </div>
              <div className="library-card p-4 text-center">
                <p className="text-2xl font-semibold text-ink">
                  {overallAccuracy}%
                </p>
                <p className="text-xs text-ink-muted mt-1">Accuracy</p>
              </div>
              <div className="library-card p-4 text-center">
                <p className="text-2xl font-semibold text-ink">
                  {progress?.seenPassages.length || 0}
                </p>
                <p className="text-xs text-ink-muted mt-1">Passages Read</p>
              </div>
            </div>
          </div>
        )}

        {lastQuiz && (
          <div>
            <h2 className="text-xl mb-4">Last Quiz</h2>
            <div className="library-card p-5">
              <div className="flex items-center gap-6">
                <ProgressRing
                  progress={Math.round(
                    ((lastQuiz.authorCorrect + lastQuiz.movementCorrect) /
                      (lastQuiz.totalQuestions * 2)) *
                      100
                  )}
                  size={80}
                  strokeWidth={6}
                />
                <div className="flex-1">
                  <p className="text-sm text-ink-light">
                    <strong className="text-ink">
                      {lastQuiz.authorCorrect}/{lastQuiz.totalQuestions}
                    </strong>{" "}
                    authors correct
                  </p>
                  <p className="text-sm text-ink-light">
                    <strong className="text-ink">
                      {lastQuiz.movementCorrect}/{lastQuiz.totalQuestions}
                    </strong>{" "}
                    movements correct
                  </p>
                  <p className="text-xs text-ink-muted mt-1">{lastQuiz.date}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {movementEntries.length > 0 && (
          <div>
            <h2 className="text-xl mb-4">Movement Mastery</h2>
            <div className="library-card p-4">
              <div className="space-y-3">
                {movementEntries.map((entry) => (
                  <div key={entry.movement!.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <Link
                          href={`/movement/${entry.movement!.id}`}
                          className="text-sm font-medium truncate hover:text-rubric-dark transition-colors"
                        >
                          {entry.movement!.name}
                        </Link>
                        <span className="text-xs text-ink-muted ml-2 flex-shrink-0">
                          {entry.accuracy}% ({entry.total} seen)
                        </span>
                      </div>
                      <div className="h-1.5 bg-vellum-dark rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${entry.accuracy}%`,
                            backgroundColor:
                              entry.accuracy >= 70
                                ? "#2f6b3e"
                                : entry.accuracy >= 40
                                  ? "#8c2f24"
                                  : "#b13b29",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xl mb-4">
            {totalQuizzes === 0 ? "What You'll Learn" : "Browse Movements"}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {MOVEMENTS.map((m) => (
              <Link
                key={m.id}
                href={`/movement/${m.id}`}
                className="library-card p-3 group block"
              >
                <p className="text-sm font-medium mb-0.5 group-hover:text-rubric-dark transition-colors">
                  {m.name}
                </p>
                <p className="text-xs text-ink-muted">{m.period}</p>
              </Link>
            ))}
          </div>
        </div>

        <footer className="text-center py-8 border-t border-vellum-dark">
          <p className="text-xs text-ink-muted">
            Passages courtesy of Project Gutenberg
          </p>
          <p className="text-xs text-ink-muted mt-1">
            {`${totalAuthors} authors · ${MOVEMENTS.length} movements · 18th century to early Modernism`}
          </p>
        </footer>
      </main>
    </div>
  );
}
