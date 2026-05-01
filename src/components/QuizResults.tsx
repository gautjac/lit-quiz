"use client";

import ProgressRing from "./ProgressRing";
import type { QuizQuestion } from "@/lib/quiz-engine";

interface AttemptResult {
  question: QuizQuestion;
  authorCorrect: boolean;
  movementCorrect: boolean;
}

interface QuizResultsProps {
  results: AttemptResult[];
  streak: number;
  onPlayAgain: () => void;
  onGoHome: () => void;
}

export default function QuizResults({
  results,
  streak,
  onPlayAgain,
  onGoHome,
}: QuizResultsProps) {
  const totalAuthor = results.filter((r) => r.authorCorrect).length;
  const totalMovement = results.filter((r) => r.movementCorrect).length;
  const totalPerfect = results.filter(
    (r) => r.authorCorrect && r.movementCorrect
  ).length;
  const total = results.length;

  const overallPercent = Math.round(
    ((totalAuthor + totalMovement) / (total * 2)) * 100
  );
  const authorPercent = Math.round((totalAuthor / total) * 100);
  const movementPercent = Math.round((totalMovement / total) * 100);

  let message = "";
  if (overallPercent >= 90) message = "A reader's reader.";
  else if (overallPercent >= 70) message = "A discerning ear.";
  else if (overallPercent >= 50) message = "Coming into focus.";
  else message = "Every Joyce reader was once a Joyce non-reader.";

  return (
    <div className="animate-fade-in-scale max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl mb-2">Quiz Complete</h1>
        <p className="text-ink-muted italic">{message}</p>
        {streak > 1 && (
          <p className="mt-2 text-rubric-dark font-medium">
            <span className="streak-flame">&#128293;</span> {streak} day streak
          </p>
        )}
      </div>

      <div className="flex justify-center gap-8 mb-8">
        <ProgressRing
          progress={authorPercent}
          label="Authors"
          sublabel={`${totalAuthor}/${total}`}
        />
        <ProgressRing
          progress={movementPercent}
          label="Movements"
          sublabel={`${totalMovement}/${total}`}
        />
      </div>

      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-vellum-dark">
          <span className="text-rubric text-lg">&#9733;</span>
          <span className="text-sm text-ink-light">
            <strong>{totalPerfect}</strong> perfect answers out of {total}
          </span>
        </div>
      </div>

      <div className="library-card p-4 mb-6">
        <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wide mb-3">
          Breakdown
        </h3>
        <div className="space-y-2">
          {results.map((result, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-2 border-b border-vellum-dark last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {result.question.correctAuthor.name}
                </p>
                <p className="text-xs text-ink-muted truncate italic">
                  {result.question.passage.bookTitle ?? "—"}
                </p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    result.authorCorrect
                      ? "bg-correct-light text-correct"
                      : "bg-wrong-light text-wrong"
                  }`}
                  title={
                    result.authorCorrect ? "Author correct" : "Author incorrect"
                  }
                >
                  {result.authorCorrect ? "✓" : "✗"}
                </span>
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    result.movementCorrect
                      ? "bg-correct-light text-correct"
                      : "bg-wrong-light text-wrong"
                  }`}
                  title={
                    result.movementCorrect
                      ? "Movement correct"
                      : "Movement incorrect"
                  }
                >
                  {result.movementCorrect ? "✓" : "✗"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onGoHome}
          className="flex-1 py-3.5 bg-white border-2 border-vellum-dark text-ink rounded-lg font-medium hover:border-rubric transition-colors cursor-pointer"
        >
          Home
        </button>
        <button
          onClick={onPlayAgain}
          className="flex-1 py-3.5 bg-ink text-vellum rounded-lg font-medium hover:bg-spine transition-colors cursor-pointer"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}
