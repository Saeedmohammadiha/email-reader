# LangGraph JavaScript/TypeScript conventions

Researched 2026-11-04 against official LangChain documentation. This is evidence
for repository instructions; recommendations marked **Local choice** are not
requirements imposed by LangGraph.

## Version and scope

- Repository evidence: `package.json` declares `@langchain/langgraph: ^1.5.2`;
  the installed package is `1.5.2`. The caret permits compatible updates, so check
  the lockfile and installed declarations before copying newer examples.
- Current guides use `StateSchema` and `GraphNode<typeof State>`, with inferred
  `typeof State.State` and partial node updates. The indexed API reference also
  documents `typeof myState.State`. These support the current repository's
  schema approach. [Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api#state),
  [typed nodes](https://docs.langchain.com/oss/javascript/langgraph/graph-api-control-flow#create-a-sequence-of-steps),
  [State reference](https://reference.langchain.com/javascript/langchain-langgraph/web/StateSchema/State)
- Stable principles below concern state, routing, failures, and re-execution;
  exact exports, generic signatures, timeout options, and newer helpers must
  still agree with installed types and `pnpm typecheck`. Installed declarations
  currently include `StateSchema`, `GraphNode`, `retryPolicy`, and node `timeout`.

## State, nodes, and prompts

- Define shared state explicitly. Return only changed fields rather than mutate
  state or spread the entire input into every update. Ordinary fields overwrite;
  reducers combine updates. Add reducers where accumulation or concurrent writes
  require them, rather than making every field append-only.
  [State and reducers](https://docs.langchain.com/oss/javascript/langgraph/graph-api#state)
- Store raw email data, classification, knowledge, and generated replies when
  later steps need them. Derive formatted prompts inside the consuming node;
  avoid storing reproducible prompt strings in state.
  [State design](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-graph-api#step-3-design-your-state)
- **Local choice:** keep task-specific prompts with the nodes that own them and
  keep model/provider adapters focused on invocation. Official guidance supports
  formatting inside nodes; it does not mandate file locations or prohibit shared
  templates. [Prompt guidance](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-graph-api#keep-state-raw-format-prompts-on-demand)
- Runtime context supplies dependencies separately from state; the guide uses
  `new StateGraph(State, ContextSchema)` and `config.context`, supplied through
  invoke options. **Local choice:** retain the existing injected-services factory
  when sufficient; keep clients and credentials outside persisted state, with
  credentials resolved at the application boundary. Context is not a secret
  vault. [Runtime configuration](https://docs.langchain.com/oss/javascript/langgraph/graph-api-nodes#add-runtime-configuration)

## Routing and failures

- Use `addEdge` for fixed successors and `addConditionalEdges` for routing alone.
  `Command({ update, goto })` is appropriate when one node owns both decisions;
  declare destinations with `ends`. Do not duplicate outgoing paths with static
  edges plus dynamic routing: static edges still execute.
  [Edges](https://docs.langchain.com/oss/javascript/langgraph/graph-api#edges),
  [Command](https://docs.langchain.com/oss/javascript/langgraph/graph-api-send-command#combine-control-flow-and-state-updates-with-command)
- Native node `retryPolicy` is opt-in. Use bounded attempts and a suitable
  `retryOn` for transient failures; do not introduce a separate sleep/retry loop.
  Native `timeout` accepts milliseconds or run/idle limits and applies separately
  to each attempt. Discarding failed state writes does not undo external effects.
  [Node policies](https://docs.langchain.com/oss/javascript/langgraph/graph-api-nodes#add-retry-policies),
  [Timeouts](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance#timeouts)
- The official failure categories distinguish transient retries, LLM-recoverable
  errors routed back with context, user-fixable problems paused for input, and
  unexpected exceptions that fail the run. Exhausted retries can use a deliberate
  `errorHandler` compensation branch. **Local choice:** bound recovery loops and
  preserve existing failure recording without hiding the original exception.
  [Failure categories](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-graph-api#handle-errors-appropriately)

## Pause, resume, and external effects

- Real pause/resume needs `interrupt()`, a checkpointer, and a stable
  `configurable.thread_id`; resume with `new Command({ resume: value })` on the
  same thread. Resume starts the interrupted node again. Keep interrupt order
  stable, payloads JSON-serializable, and avoid swallowing the interrupt exception.
  [Interrupt rules](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- `MemorySaver` is suitable for tests, but loses checkpoints on process restart;
  persistent production resume needs durable storage.
  [Persistence limitations](https://docs.langchain.com/oss/javascript/langgraph/persistence#memorysaver-does-not-persist-between-restarts)
- Retried or resumed nodes can repeat side effects. Put sends after approval and
  use stable idempotency keys or durable deduplication; separate nodes alone do
  not guarantee one send. [Retry boundaries](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance#retry-boundaries-and-idempotency)
- Replay from an older checkpoint runs later nodes again, including LLM calls,
  APIs, and interrupts. Treat replay as execution with external effects.
  [Replay](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel#replay)

## Tests and adoption in this repository

- Official tests build fresh graphs/checkpointers and exercise graph or individual
  nodes; direct node invocation bypasses checkpoint behavior. **Local choice:**
  keep `node:test` and inject deterministic model, mail, knowledge, and failure
  fixtures through the existing factory. Test routes and externally visible
  effects; add retry/resume checks when implementing those capabilities.
  [Testing](https://docs.langchain.com/oss/javascript/langgraph/test)
- Repository evidence: the active graph is `src/passwordWorkflow.ts`; its callers
  use `createWorkflow`, and `tests/passwordWorkflow.test.ts` already injects
  services. Existing conditional routes and partial updates are valid conventions.
  The current `human` node logs and ends; it does not implement durable review.
- **Local choice:** apply instructions to new and touched active workflow code,
  using typed nodes and native graph features when behavior needs them. Do not
  mandate `Command` everywhere, migrate unused examples, or add persistence,
  retries for email sends, and human-review infrastructure merely to match an
  illustrative guide. Such behavior changes require their own tested scope.
