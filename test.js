import { DefaultAzureCredential } from "@azure/identity";
  import { AIProjectClient } from "@azure/ai-projects";

  const projectEndpoint = "https://akcloudlabs-ai-foundry2.services.ai.azure.com/api/projects/proj-default";
  const agentName = "model-router";
  const agentVersion = "2";

  const projectClient = new AIProjectClient(projectEndpoint, new DefaultAzureCredential());

  async function main() {
    const openAIClient = await projectClient.getAzureOpenAIClient({
      apiVersion: "2024-10-21"
    });

    console.log("Creating conversation...");
    const conversation = await openAIClient.conversations.create({
      items: [{ type: "message", role: "user", content: "What is the size of France in square miles?" }]
    });

    console.log("Conversation id:", conversation.id);

    console.log("Generating response...");
    const response = await openAIClient.responses.create(
      {
        conversation: conversation.id
      },
      {
        body: {
          agent: {
            name: agentName,
            version: agentVersion,
            type: "agent_reference"
          }
        }
      }
    );

    console.log("Response output:");
    console.log(response.output_text);
  }

  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });

 