export function formatPossiblyBlockedLabel(
  protocolBlocked: boolean,
  inferred: boolean,
): string {
  if (protocolBlocked) {
    return "blocked";
  }
  if (inferred) {
    return "possibly-blocked";
  }
  return "";
}
