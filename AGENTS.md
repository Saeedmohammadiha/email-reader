## Agent skills

### Issue tracker

For specs, tickets, and issue-tracker operations, see `docs/agents/issue-tracker.md`.

### Triage labels

For issue status vocabulary, see `docs/agents/triage-labels.md`.

### Domain docs

Before domain-related work, read `docs/agents/domain.md`. This project uses a single domain context.

### LangGraph conventions

Use only official LangGraph JavaScript/TypeScript conventions and native APIs for workflow orchestration: state, nodes, routing, retries, interrupts, and persistence. Match the installed package version.

Before implementing or reviewing workflow changes, read and apply `.agents/skills/langgraph-workflows/SKILL.md`. Each model node owns and builds the system prompt required for its task.
