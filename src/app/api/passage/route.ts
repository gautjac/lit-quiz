import { type NextRequest } from "next/server";
import { fetchPassageForAuthor, fetchBookMeta } from "@/lib/gutenberg";
import { getCachedPassage } from "@/lib/passage-cache";
import { getAuthorById } from "@/lib/authors";

export async function GET(request: NextRequest) {
  const authorId = request.nextUrl.searchParams.get("author");
  if (!authorId) {
    return Response.json({ error: "Missing author parameter" }, { status: 400 });
  }

  const author = getAuthorById(authorId);
  if (!author) {
    return Response.json({ error: "Unknown author" }, { status: 404 });
  }

  // Fast path: pre-extracted passage shipped with the build. This is what
  // serves real users — instant response, no Gutenberg dependency.
  const cached = getCachedPassage(authorId);
  if (cached) {
    return Response.json({
      authorId: author.id,
      authorName: author.name,
      passage: cached.passage,
      form: author.form,
      bookId: cached.bookId,
      bookTitle: cached.bookTitle,
      gutenbergUrl: `https://www.gutenberg.org/ebooks/${cached.bookId}`,
      source: "cache",
    });
  }

  // Fallback: hit Project Gutenberg directly. Only used when an author has
  // no entries in the static cache (e.g. during local development before
  // the cache has been generated).
  try {
    const result = await fetchPassageForAuthor(author.gutenbergIds, author.form);
    if (!result) {
      return Response.json(
        { error: "No suitable passage found for this author" },
        { status: 502 }
      );
    }

    const meta = await fetchBookMeta(result.bookId);

    return Response.json({
      authorId: author.id,
      authorName: author.name,
      passage: result.passage,
      form: author.form,
      bookId: result.bookId,
      bookTitle: meta?.title ?? null,
      gutenbergUrl: `https://www.gutenberg.org/ebooks/${result.bookId}`,
      source: "live",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
