import { type NextRequest } from "next/server";
import { fetchPassageForAuthor, fetchBookMeta } from "@/lib/gutenberg";
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
