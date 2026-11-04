## Rules

# always keep the app and code simple
    select the simpler approach that fullfills our requirements but it is simpler, don't make the application complex.
 
# Ask if it is not clear
    if there is something unclear or didn't mentioned yet you should always ask and MUST NOT guess.




## Agent skills

# langgraph-workflows
    each time you want to use langgraph MUST be the langgraph conventions and you can use `langgraph-workflows` skill


### LangGraph conventions

Use only official LangGraph JavaScript/TypeScript conventions and native APIs for workflow orchestration: state, nodes, routing, retries, interrupts, and persistence. Match the installed package version.

Before implementing or reviewing workflow changes, read and apply `.agents/skills/langgraph-workflows/SKILL.md`. Each model node owns and builds the system prompt required for its task.



