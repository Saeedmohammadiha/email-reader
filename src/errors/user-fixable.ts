// import { Command, GraphNode, interrupt } from "@langchain/langgraph";

// const lookupCustomerHistory: GraphNode<typeof State> = async (state, config) => {
//   if (!state.customerId) {
//     const userInput = interrupt({
//       message: "Customer ID needed",
//       request: "Please provide the customer's account ID to look up their subscription history",
//     });
//     return new Command({
//       update: { customerId: userInput.customerId },
//       goto: "lookupCustomerHistory",
//     });
//   }
//   // Now proceed with the lookup
//   const customerData = await fetchCustomerHistory(state.customerId);
//   return new Command({
//     update: { customerHistory: customerData },
//     goto: "draftResponse",
//   });
// }