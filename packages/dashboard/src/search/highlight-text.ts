import { html, type TemplateResult } from "lit";

/**
 * Wraps occurrences of search terms in `<mark class="search-hit">` for
 * highlighted rendering inside Lit templates.
 */
export function highlightText(
  text: string,
  query: string,
): TemplateResult | string {
  const trimmed = query.trim();
  if (trimmed === "") {
    return text;
  }
  const terms = trimmed.split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) {
    return text;
  }
  const escaped = terms.map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts: (TemplateResult | string)[] = [];
  let lastIndex = 0;
  let hasMatch = false;
  for (const match of text.matchAll(regex)) {
    hasMatch = true;
    const idx = match.index!;
    if (idx > lastIndex) {
      parts.push(text.slice(lastIndex, idx));
    }
    parts.push(html`<mark class="search-hit">${match[0]}</mark>`);
    lastIndex = idx + match[0].length;
  }
  if (!hasMatch) {
    return text;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return html`${parts}`;
}
