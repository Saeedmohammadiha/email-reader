---
name: langgraph-workflows
description: Implement or review this repository's LangGraph TypeScript workflows, including shared state, nodes, routing, model prompts, retries, and human review. Apply when changing graph behavior or its model/service integration.
---

# LangGraph workflows

Use the official JavaScript/TypeScript Graph API for workflow orchestration. Read
the current implementation section of [the architecture](../../../APPLICATION_ARCHITECTURE.md)
for repository structure and the [official Graph API guide](https://docs.langchain.com/oss/javascript/langgraph/graph-api)
for framework semantics. Check installed declarations when a documented API is
unfamiliar; current online docs may differ from the installed version.

## Repository conventions

- Reuse `EmailAgentState` and `EmailClassificationSchema` from
  `src/emailClassification.ts`. Derive state and classification types from them.
  Extend the shared schema when a flow needs another persisted field.
- Extend the single compiled graph in `src/workflow.ts`. Register node functions
  imported from `src/nodes/` and `src/branches/`; the password flow is a branch of
  that graph. Keep workflow construction direct rather than introducing factories
  or an injected bundle of node implementations.
- Channel adapters validate and normalize source events to `IncomingRequest` from
  `src/adapters/types.ts`. The listener passes `{ request }` to `workflow.invoke`,
  entering classification from `START`. Keep provider payloads in their adapter.
- Each model node owns and builds its task-specific system prompt from the context
  it needs. Construct messages when invoking the model. This is a repository
  choice; LangGraph does not mandate a `SYSTEM_PROMPT` environment variable or a
  particular prompt-file layout.
- Keep provider clients and credentials outside persisted state. The `send` node
  uses the channel adapter in LangGraph runtime context. Model nodes use the shared
  client from `getModel()` in `src/model.ts`. Native graph APIs own scheduling and
  recovery; channel adapters own provider retrieval and delivery.

## State and nodes

- Build with `StateGraph`, `START`, and `END`, then compile before invoking.
  Type separately declared nodes with `GraphNode<typeof EmailAgentState>` or
  `typeof EmailAgentState.Node`; inline nodes may use graph inference.
- Return partial state updates instead of mutating state. Keep raw request data,
  retrieved evidence, and model results in state; format prompts on demand.
- Default updates overwrite a field. Add a reducer only when updates must merge,
  including concurrent writers to the same field. Use `MessagesValue` if a flow
  actually needs persisted chat history.
- Validate external payloads, structured model output, and human resume values at
  their boundaries. Use the shared classification schema with structured output.

## Routing and recovery

- Use `addEdge` for fixed transitions and `addConditionalEdges` for decisions from
  state. Use `Command({ update, goto })` when one node should update state and
  choose its next destination together. Declare `ends` when registering a
  `Command`-routing node and type its destinations when practical.
- Give a node one routing mechanism. An unconditional edge still executes when
  that node also routes dynamically; this can accidentally execute both paths.
- Use node options such as `retryPolicy` and supported `timeout` settings for
  transient failures. Classify retryable errors and bound attempts. Use a node
  `errorHandler` for recovery after retry exhaustion when appropriate, and explicit
  graph paths for clarification. Propagate unexpected errors and preserve graph
  control-flow signals in any logging/error wrapper.
- Give loops a domain exit condition and use `recursionLimit` as a guard. Apply
  `Send` or subgraphs only when the requested flow needs their documented behavior.

## Human review and external actions

- For a resumable pause, use `interrupt()` with a checkpointer and stable
  `configurable.thread_id`; resume with `new Command({ resume: value })` using
  that same thread. An in-memory checkpointer is suitable for tests, while restart
  recovery needs durable storage.
- Interrupted nodes restart from their beginning. Keep interrupt order stable,
  use JSON-serializable payloads, and let the interrupt signal reach LangGraph.
  Put side effects after approval or make replay safe.
- Sending email or publishing a ticket must be safe under retries and replay.
  Checkpointing alone does not guarantee an external action happens only once;
  use the provider's idempotency mechanism or a durable application record.
- A console log followed by `END` is a terminal handoff, not a resumable review.
  Preserve the current milestone's scope unless the task includes review support.

## Verify the requested behavior

Exercise affected routes through the single graph with mocked provider HTTP and run the
repository's relevant checks. Assert observable outcomes, failure state, and
side-effect counts. When adding retries or interrupts, cover exhaustion or
pause/resume behavior respectively. Identify local product choices separately
from framework requirements in the handoff.
