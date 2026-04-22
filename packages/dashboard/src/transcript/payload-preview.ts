/** Max JSON preview length for transcript search index and row display. */
export const PREVIEW_MAX = 240;

export function previewPayload(payload: Record<string, unknown>): string {
  const raw = JSON.stringify(payload);
  if (raw.length <= PREVIEW_MAX) {
    return raw;
  }
  return `${raw.slice(0, PREVIEW_MAX)}…`;
}
