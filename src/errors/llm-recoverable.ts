// import { Command, GraphNode } from "@langchain/langgraph";

// const executeTool: GraphNode<typeof State> = async (state, config) => {
//   try {
//     const result = await runTool(state.toolCall);
//     return new Command({
//       update: { toolResult: result },
//       goto: "agent",
//     });
//   } catch (error) {
//     // Let the LLM see what went wrong and try again
//     return new Command({
//       update: { toolResult: `Tool error: ${error}` },
//       goto: "agent"
//     });
//   }
// }