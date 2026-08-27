/** Review body normalization. HTML-to-Markdown favours GitHub's source body. */

const CODEX_REVIEW_AUTHOR = "chatgpt-codex-connector";

export interface ReviewContent {
  body: string;
  priority?: string;
  title?: string;
}

/**
 * Dependency-free converter. The original pi-pr used turndown to convert
 * GitHub's rendered HTML; this fork deliberately has no runtime npm
 * dependencies, so it always uses GitHub's source Markdown body directly.
 */
export async function loadHtmlConverter(): Promise<void> {
  // Intentionally a no-op in this fork: review bodies are used as GitHub
  // provides them, so there is nothing to pre-load.
}

export function normalizeReviewMarkdown(markdown: string): ReviewContent {
  const withoutFooter = markdown
    .replace(/(?:^|\n{2,})Useful\?\s+React with\s+👍\s*\/\s*👎\.?\s*$/u, "")
    .trim();
  const heading = /^\*\*(P\d+) Badge\s+([^\n]+)\*\*(?:\n{2,}|$)/u.exec(
    withoutFooter,
  );
  if (!heading) return { body: withoutFooter };

  return {
    body: withoutFooter.slice(heading[0].length).trim(),
    priority: heading[1]?.toUpperCase(),
    title: heading[2]?.trim(),
  };
}

/** Drop the boilerplate that wraps every Codex review body. */
export function stripCodexReviewBoilerplate(markdown: string): string {
  if (!/^###\s+💡\s+Codex Review(?:\n|$)/u.test(markdown)) return markdown;

  const withoutIntro = markdown
    .replace(/^###\s+💡\s+Codex Review\s*/u, "")
    .replace(
      /^Here are some automated review suggestions for this pull request\.\s*/u,
      "",
    )
    .replace(/^\*\*Reviewed commit:\*\*\s+`?[0-9a-f]{7,40}`?\s*/iu, "");
  const aboutIndex = withoutIntro.search(
    /(?:^|\n+)ℹ️\s+About Codex in GitHub[ \t]*(?:\n|$)/iu,
  );
  return (
    aboutIndex < 0 ? withoutIntro : withoutIntro.slice(0, aboutIndex)
  ).trim();
}

export function reviewContentFrom(
  body: string,
  _bodyHtml: string,
  author: string,
  isReview: boolean,
): ReviewContent {
  const content = normalizeReviewMarkdown(body);

  if (!isReview || author !== CODEX_REVIEW_AUTHOR) return content;
  return { ...content, body: stripCodexReviewBoilerplate(content.body) };
}
