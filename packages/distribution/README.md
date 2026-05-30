# agent-talkie

Agent Talkie is a local-first collaboration layer for coding agents that already run in different products.

Install or update local Talkie runtime configuration with:

```bash
npx agent-talkie@latest
```

During local development, do not use npm `latest` unless the current
implementation has already been published. Use the source entrypoint instead:

```bash
node packages/distribution/bin/agent-talkie.js --yes --local --codex --claude --project-root "$PWD"
```

The installer can configure:

- one-machine collaboration across Codex CLI and Claude Code, with Cursor App support remaining available for MCP-backed development
- runtime-facing Talkie skills installed with the product
- Cursor MCP configuration installed or updated by the installer
- Claude Code project MCP configuration installed or updated by the installer
- local relay and dashboard setup diagnostics
- a dashboard-centered workflow where the human talks to the orchestrator by default

It writes only Talkie-owned files or config entries, creates backups before mutating existing files, installs durable project-root wrappers in `.agent-talkie/bin/`, and records `.agent-talkie/install-manifest.json`.

`--project-root` is the local project/config root where the installer writes Talkie-owned files such as `.agent-talkie/`, `.codex/skills/`, `.cursor/mcp.json`, `.claude/skills/`, and `.mcp.json`. It is not the Talkie Space itself and does not require every joined runtime session to work from the same directory. Joined sessions keep their own native runtime context and may expose different workspace labels in the participant roster.

## Where should I install?

For the simplest current local flow, install into the project root you open in Codex CLI and Claude Code. Use one project root and install Codex plus Claude support first; add Cursor support when you are explicitly testing the Cursor MCP path.

If your runtimes intentionally work in different repos, install only the needed runtime support into each repo:

```bash
npx agent-talkie@latest --yes --local --codex --project-root /path/to/repo-a
npx agent-talkie@latest --yes --local --cursor --project-root /path/to/repo-b
npx agent-talkie@latest --yes --local --claude --project-root /path/to/repo-c
```

Those sessions can still join the same Talkie Space because the relay is local-machine shared state; `--project-root` only controls where that repo's Talkie wrappers, skills, and runtime MCP config are written.

Non-interactive examples:

```bash
npx agent-talkie@latest --yes --local --codex --claude
npx agent-talkie@latest --project-root /path/to/repo --cursor --claude
```

After install, use `./.agent-talkie/bin/talkie` from the project root for Talkie CLI commands. The generated Cursor MCP config points at `.agent-talkie/bin/talkie-cursor-mcp`, and the generated Claude Code project MCP config points at `.agent-talkie/bin/talkie-claude-mcp`, so neither depends on the temporary `npx` install path.

To print the manual desktop UAT checklist without installing or changing files:

```bash
npx agent-talkie@latest --uat-guide --project-root /path/to/repo
```

When validating unpublished local changes from this development repository, use
the source entrypoint instead of npm `latest`:

```bash
node packages/distribution/bin/agent-talkie.js --uat-guide --project-root "$PWD"
```
