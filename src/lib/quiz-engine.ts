import {
  AUTHORS,
  MOVEMENTS,
  type Author,
  getMovementById,
} from "./authors";
import {
  type PassageRecord,
  type UserProgress,
  getAuthorWeight,
  hashPassage,
} from "./storage";

export interface QuizQuestion {
  passage: PassageRecord;
  authorChoices: Author[];
  movementChoices: { id: string; name: string }[];
  correctAuthor: Author;
  correctMovement: { id: string; name: string };
}

export function selectAuthorsForQuiz(
  progress: UserProgress,
  count = 10
): Author[] {
  const weighted = AUTHORS.map((author) => ({
    author,
    weight: getAuthorWeight(progress, author.id).weight,
  }));

  const selected: Author[] = [];
  const pool = [...weighted];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (let j = 0; j < pool.length; j++) {
      random -= pool[j].weight;
      if (random <= 0) {
        selected.push(pool[j].author);
        pool.splice(j, 1);
        break;
      }
    }
  }

  return selected;
}

interface PassageApiResponse {
  authorId: string;
  authorName: string;
  passage: string;
  form: Author["form"];
  bookId: number;
  bookTitle: string | null;
  gutenbergUrl: string;
}

async function fetchOnePassage(
  author: Author
): Promise<PassageRecord | null> {
  try {
    const res = await fetch(`/api/passage?author=${encodeURIComponent(author.id)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as PassageApiResponse;
    return {
      id: `${data.authorId}-${data.bookId}-${hashPassage(data.passage)}`,
      authorId: data.authorId,
      authorName: data.authorName,
      passage: data.passage,
      bookId: data.bookId,
      bookTitle: data.bookTitle,
      gutenbergUrl: data.gutenbergUrl,
    };
  } catch (err) {
    console.error(`Passage fetch failed for ${author.name}:`, err);
    return null;
  }
}

// Fetch passages in parallel batches so we don't hammer Gutenberg.
async function fetchBatch<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function fetchPassagesForAuthors(
  authors: Author[]
): Promise<Map<string, PassageRecord>> {
  const results = new Map<string, PassageRecord>();
  const records = await fetchBatch(authors, 4, fetchOnePassage);
  for (let i = 0; i < authors.length; i++) {
    const r = records[i];
    if (r) results.set(authors[i].id, r);
  }
  return results;
}

export function generateQuizQuestions(
  passageMap: Map<string, PassageRecord>,
  authors: Author[],
  count = 10,
  seenPassageIds: string[] = []
): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  const usedAuthors = authors.filter((a) => passageMap.has(a.id));
  const seenSet = new Set(seenPassageIds);

  // Sort: prefer authors whose passage is unseen.
  const preferred = usedAuthors.filter(
    (a) => !seenSet.has(passageMap.get(a.id)!.id)
  );
  const fallback = usedAuthors.filter((a) =>
    seenSet.has(passageMap.get(a.id)!.id)
  );
  const ordered = [...preferred, ...fallback];

  for (const author of ordered) {
    if (questions.length >= count) break;

    const passage = passageMap.get(author.id)!;
    const movement = getMovementById(author.movement);
    if (!movement) continue;

    const wrongAuthors = generateWrongAuthorChoices(author, 3);
    const authorChoices = shuffle([author, ...wrongAuthors]);

    const wrongMovements = generateWrongMovementChoices(movement.id, 3);
    const movementChoices = shuffle([
      { id: movement.id, name: movement.name },
      ...wrongMovements,
    ]);

    questions.push({
      passage,
      authorChoices,
      movementChoices,
      correctAuthor: author,
      correctMovement: { id: movement.id, name: movement.name },
    });
  }

  return shuffle(questions).slice(0, count);
}

function generateWrongAuthorChoices(correct: Author, count: number): Author[] {
  const candidates = AUTHORS.filter((a) => a.id !== correct.id);

  const sameCentury = candidates.filter((a) => a.century === correct.century);
  const sameMovement = candidates.filter((a) => a.movement === correct.movement);
  const sameForm = candidates.filter((a) => a.form === correct.form);

  // Plausible distractors: mix of same-century, same-movement, same-form.
  const preferred = [
    ...new Set([...sameMovement, ...sameCentury, ...sameForm]),
  ];
  const others = candidates.filter((a) => !preferred.includes(a));

  const pool = preferred.length >= count ? preferred : [...preferred, ...others];
  return shuffle(pool).slice(0, count);
}

function generateWrongMovementChoices(
  correctMovementId: string,
  count: number
): { id: string; name: string }[] {
  const wrong = MOVEMENTS.filter((m) => m.id !== correctMovementId);
  return shuffle(wrong)
    .slice(0, count)
    .map((m) => ({ id: m.id, name: m.name }));
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
