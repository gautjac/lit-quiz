"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  selectAuthorsForQuiz,
  fetchPassagesForAuthors,
  generateQuizQuestions,
  type QuizQuestion,
} from "@/lib/quiz-engine";
import {
  getProgress,
  saveProgress,
  updateWeightAfterAttempt,
  updateStreak,
  type DailyQuizResult,
  type QuizAttempt,
} from "@/lib/storage";
import QuizResults from "@/components/QuizResults";
import { type Author, getMovementById } from "@/lib/authors";

type PageState = "loading" | "playing" | "results" | "error";
type Phase = "author" | "movement" | "reveal";

interface AttemptResult {
  question: QuizQuestion;
  authorCorrect: boolean;
  movementCorrect: boolean;
}

const QUIZ_SIZE = 10;

export default function QuizPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<AttemptResult[]>([]);
  const [streak, setStreak] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState(
    "Pulling volumes from the stacks..."
  );

  const [phase, setPhase] = useState<Phase>("author");
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const [authorCorrect, setAuthorCorrect] = useState(false);
  const [movementCorrect, setMovementCorrect] = useState(false);

  const question = questions[currentIndex] ?? null;
  const movement = question
    ? getMovementById(question.correctAuthor.movement)
    : null;

  const loadQuiz = useCallback(async () => {
    setPageState("loading");
    setCurrentIndex(0);
    setResults([]);
    setPhase("author");
    setSelectedAuthor(null);
    setSelectedMovement(null);
    setAuthorCorrect(false);
    setMovementCorrect(false);

    const messages = [
      "Pulling volumes from the stacks...",
      "Cutting the pages...",
      "Letting the print dry...",
      "Choosing today's passages...",
    ];
    let msgIndex = 0;
    const msgInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % messages.length;
      setLoadingMessage(messages[msgIndex]);
    }, 2000);

    try {
      const progress = getProgress();
      // Over-fetch a few extra so passages that fail extraction don't shrink the quiz.
      const authors = selectAuthorsForQuiz(progress, QUIZ_SIZE + 5);
      const passageMap = await fetchPassagesForAuthors(authors);
      const quizQuestions = generateQuizQuestions(
        passageMap,
        authors,
        QUIZ_SIZE,
        progress.seenPassages
      );

      if (quizQuestions.length === 0) {
        setLoadingMessage(
          "Project Gutenberg seems to be napping. Try again in a moment..."
        );
        setPageState("error");
        return;
      }

      setQuestions(quizQuestions);
      setPageState("playing");
    } catch (err) {
      console.error("Failed to load quiz:", err);
      setLoadingMessage(
        "Project Gutenberg seems to be napping. Try again in a moment..."
      );
      setPageState("error");
    } finally {
      clearInterval(msgInterval);
    }
  }, []);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  function handleAuthorChoice(author: Author) {
    if (selectedAuthor || !question) return;
    const correct = author.id === question.correctAuthor.id;
    setSelectedAuthor(author.id);
    setAuthorCorrect(correct);
  }

  function handleMovementChoice(movementId: string) {
    if (selectedMovement || !question) return;
    const correct = movementId === question.correctMovement.id;
    setSelectedMovement(movementId);
    setMovementCorrect(correct);
  }

  function advanceToMovement() {
    setPhase("movement");
  }

  function advanceToReveal() {
    setPhase("reveal");
  }

  function advanceToNext() {
    if (!question) return;

    const progress = getProgress();
    updateWeightAfterAttempt(
      progress,
      question.correctAuthor.id,
      authorCorrect,
      movementCorrect
    );

    const newResult: AttemptResult = { question, authorCorrect, movementCorrect };
    const newResults = [...results, newResult];
    setResults(newResults);

    if (currentIndex + 1 >= questions.length) {
      updateStreak(progress);
      setStreak(progress.streak);

      const dailyResult: DailyQuizResult = {
        date: new Date().toISOString().split("T")[0],
        totalQuestions: questions.length,
        authorCorrect: newResults.filter((r) => r.authorCorrect).length,
        movementCorrect: newResults.filter((r) => r.movementCorrect).length,
        attempts: newResults.map(
          (r): QuizAttempt => ({
            date: new Date().toISOString(),
            passageId: r.question.passage.id,
            authorId: r.question.correctAuthor.id,
            authorCorrect: r.authorCorrect,
            movementCorrect: r.movementCorrect,
          })
        ),
      };
      progress.quizHistory.push(dailyResult);

      for (const r of newResults) {
        if (!progress.seenPassages.includes(r.question.passage.id)) {
          progress.seenPassages.push(r.question.passage.id);
        }
      }

      saveProgress(progress);
      setPageState("results");
    } else {
      setPhase("author");
      setSelectedAuthor(null);
      setSelectedMovement(null);
      setAuthorCorrect(false);
      setMovementCorrect(false);
      setCurrentIndex(currentIndex + 1);
    }
  }

  return (
    <div className="min-h-screen bg-vellum">
      <header className="border-b border-vellum-dark bg-white/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-2 sm:py-3 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            &larr; Back
          </button>
          <h1
            className="text-lg tracking-tight"
            style={{ fontStyle: "italic", fontFamily: "Georgia, serif" }}
          >
            Anthologie
          </h1>
          <div className="w-12" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 sm:py-8">
        {pageState === "loading" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-fade-in">
            <div className="loading-passage shimmer w-72 h-48 rounded" />
            <p className="text-ink-muted text-sm mt-4 italic">{loadingMessage}</p>
          </div>
        )}

        {pageState === "error" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-fade-in text-center">
            <p className="text-ink-muted text-sm italic max-w-md">
              {loadingMessage}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => router.push("/")}
                className="px-6 py-2 bg-white border-2 border-vellum-dark text-ink rounded-lg font-medium hover:border-rubric transition-colors cursor-pointer"
              >
                Home
              </button>
              <button
                onClick={loadQuiz}
                className="px-6 py-2 bg-ink text-vellum rounded-lg font-medium hover:bg-spine transition-colors cursor-pointer"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {pageState === "playing" && question && (
          <div>
            {/* Progress bar */}
            <div className="mb-4 sm:mb-6 flex items-center gap-3">
              <span className="text-sm text-ink-muted font-medium">
                {currentIndex + 1} / {questions.length}
              </span>
              <div className="flex-1 h-1.5 bg-vellum-dark rounded-full overflow-hidden">
                <div
                  className="h-full bg-rubric rounded-full transition-all duration-500"
                  style={{
                    width: `${((currentIndex + 1) / questions.length) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Passage */}
            <div className="mb-4 sm:mb-6">
              <div
                className={`passage-card max-w-2xl mx-auto ${
                  question.correctAuthor.form === "poetry" ? "poetry" : ""
                }`}
              >
                <div
                  className={
                    question.correctAuthor.form === "prose" ||
                    question.correctAuthor.form === "essay"
                      ? "drop-cap"
                      : ""
                  }
                >
                  {question.passage.passage}
                </div>
              </div>
              {phase === "reveal" && (
                <div className="mt-4 text-center max-w-2xl mx-auto">
                  {question.passage.bookTitle && (
                    <p className="text-sm text-ink-muted italic">
                      from <span className="text-ink">{question.passage.bookTitle}</span>
                    </p>
                  )}
                  <a
                    href={question.passage.gutenbergUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-ink-muted hover:text-rubric-dark underline-offset-2 hover:underline mt-0.5 inline-block"
                  >
                    Read on Project Gutenberg →
                  </a>
                </div>
              )}
            </div>

            {/* AUTHOR PHASE */}
            {phase === "author" && (
              <div>
                <h2 className="text-lg sm:text-xl mb-3 sm:mb-4 text-center">
                  Who wrote this passage?
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:gap-3 max-w-xl mx-auto">
                  {question.authorChoices.map((author) => {
                    let cls = "choice-btn";
                    if (selectedAuthor) {
                      if (author.id === question.correctAuthor.id)
                        cls += " correct";
                      else if (author.id === selectedAuthor) cls += " wrong";
                    }
                    return (
                      <button
                        key={author.id}
                        className={cls}
                        onClick={() => handleAuthorChoice(author)}
                        disabled={!!selectedAuthor}
                      >
                        <span className="font-medium text-sm sm:text-base">
                          {author.name}
                        </span>
                        <span className="block text-[10px] sm:text-xs text-ink-muted mt-0.5">
                          {author.nationality}, {author.birthYear}–
                          {author.deathYear || "present"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedAuthor && (
                  <div className="mt-4 text-center">
                    <p
                      className={`text-sm font-medium mb-3 ${
                        authorCorrect ? "text-correct" : "text-wrong"
                      }`}
                    >
                      {authorCorrect
                        ? "Correct."
                        : `It's ${question.correctAuthor.name}.`}
                    </p>
                    <button
                      onClick={advanceToMovement}
                      className="px-6 py-2 bg-ink text-vellum rounded-lg font-medium hover:bg-spine transition-colors cursor-pointer"
                    >
                      Continue
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* MOVEMENT PHASE */}
            {phase === "movement" && (
              <div>
                <h2 className="text-lg sm:text-xl mb-3 text-center">
                  What movement is{" "}
                  <span className="text-rubric-dark italic">
                    {question.correctAuthor.name}
                  </span>{" "}
                  associated with?
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:gap-3 max-w-xl mx-auto">
                  {question.movementChoices.map((m) => {
                    let cls = "choice-btn";
                    if (selectedMovement) {
                      if (m.id === question.correctMovement.id)
                        cls += " correct";
                      else if (m.id === selectedMovement) cls += " wrong";
                    }
                    return (
                      <button
                        key={m.id}
                        className={cls}
                        onClick={() => handleMovementChoice(m.id)}
                        disabled={!!selectedMovement}
                      >
                        <span className="font-medium text-sm sm:text-base">
                          {m.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedMovement && (
                  <div className="mt-4 text-center">
                    <p
                      className={`text-sm font-medium mb-3 ${
                        movementCorrect ? "text-correct" : "text-wrong"
                      }`}
                    >
                      {movementCorrect
                        ? "Correct."
                        : `The answer is ${question.correctMovement.name}.`}
                    </p>
                    <button
                      onClick={advanceToReveal}
                      className="px-6 py-2 bg-ink text-vellum rounded-lg font-medium hover:bg-spine transition-colors cursor-pointer"
                    >
                      Continue
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* REVEAL PHASE */}
            {phase === "reveal" && (
              <div className="max-w-xl mx-auto">
                <div className="flex justify-center gap-4 mb-5">
                  <div
                    className={`px-4 py-2 rounded-full text-sm font-medium ${
                      authorCorrect
                        ? "bg-correct-light text-correct"
                        : "bg-wrong-light text-wrong"
                    }`}
                  >
                    Author: {authorCorrect ? "Correct" : "Incorrect"}
                  </div>
                  <div
                    className={`px-4 py-2 rounded-full text-sm font-medium ${
                      movementCorrect
                        ? "bg-correct-light text-correct"
                        : "bg-wrong-light text-wrong"
                    }`}
                  >
                    Movement: {movementCorrect ? "Correct" : "Incorrect"}
                  </div>
                </div>

                <div className="library-card p-5 mb-6">
                  <h3 className="text-lg mb-1">
                    {question.correctAuthor.name}
                  </h3>
                  <p className="text-sm text-rubric-dark font-medium mb-2">
                    {movement?.name} · {movement?.period}
                  </p>
                  <p className="text-sm text-ink-light leading-relaxed mb-3">
                    {question.correctAuthor.bio}
                  </p>
                  {movement && (
                    <div className="pt-3 border-t border-vellum-dark">
                      <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
                        About {movement.name}
                      </p>
                      <p className="text-sm text-ink-light leading-relaxed">
                        {movement.description}
                      </p>
                    </div>
                  )}
                </div>

                <button
                  onClick={advanceToNext}
                  className="w-full py-3.5 bg-ink text-vellum rounded-lg font-medium hover:bg-spine transition-colors cursor-pointer"
                >
                  {currentIndex + 1 === questions.length
                    ? "See Results"
                    : "Next Passage"}
                </button>
              </div>
            )}
          </div>
        )}

        {pageState === "results" && (
          <QuizResults
            results={results}
            streak={streak}
            onPlayAgain={loadQuiz}
            onGoHome={() => router.push("/")}
          />
        )}
      </main>
    </div>
  );
}
