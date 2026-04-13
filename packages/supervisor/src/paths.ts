import envPaths from "env-paths";

export function resolveAgentTalkieDataDir(override?: string): string {
  const trimmed = override?.trim();
  if (trimmed) {
    return trimmed;
  }
  const env = process.env.AGENT_TALKIE_DATA_DIR?.trim();
  if (env) {
    return env;
  }
  return envPaths("agent-talkie", { suffix: "" }).data;
}
