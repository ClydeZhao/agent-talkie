# Agent Learnings

本文件存放对未来工作仍有用、但还没有升格为正式产品、架构或 workflow 规则的仓库级经验。

当一条经验变成稳定规则时，应把它升格到 `PRD.md`、`docs/architecture.md`、`docs/milestones/`、package README 或 `AGENTS.md`。不再有用的条目应删除。

不要在这里记录一次性事故、私人偏好、本机环境细节或临时调试备注。本机和私人上下文放到 gitignored 的 `.agents/local/`。

## Entries

- For desktop runtime UAT, do not treat shell-level macOS automation as a substitute for Computer Use or human observation unless the preflight proves it can both control and observe the real apps. At minimum, verify Accessibility trust, screen-capture access, a click/type driver, visible target app windows, and readable evidence of the actual Talkie flow before relying on it for Codex App or Cursor App validation.
