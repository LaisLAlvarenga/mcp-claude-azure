import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const organization = process.env.AZURE_DEVOPS_ORG;
const pat = process.env.AZURE_DEVOPS_PAT;

if (!organization || !pat) {
  throw new Error(
    "AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT precisam estar configurados no .env"
  );
}

const server = new Server(
  {
    name: "azure-devops-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_projects",
        description:
          "Lista os projetos disponíveis na organização Azure DevOps configurada.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "list_projects") {
    throw new Error(`Ferramenta desconhecida: ${request.params.name}`);
  }

  const credentials = Buffer.from(`:${pat}`).toString("base64");

  const response = await fetch(
    `https://dev.azure.com/${organization}/_apis/projects?api-version=7.1`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Erro ao consultar Azure DevOps: ${response.status} ${errorText}`
    );
  }

  const data = await response.json();

  const projects = data.value.map((project) => ({
    id: project.id,
    name: project.name,
    state: project.state,
    url: project.url,
  }));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(projects, null, 2),
      },
    ],
  };
});

const transport = new StdioServerTransport();

await server.connect(transport);