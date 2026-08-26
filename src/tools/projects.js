// tools mcp relacionados ao projeto.
// Tranformando os serviços em ferramentas MCP.
import { z } from "zod";

import {
  getProjects,
  getProject,
} from "../services/azureDevOps.js";

export function registerProjectTools(server) {
  server.tool(
    "list_projects",
    "Lista todos os projetos disponíveis na organização Azure DevOps configurada.",
    async () => {
      const projects = await getProjects();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "get_project",
    "Consulta um projeto específico do Azure DevOps pelo nome.",
    {
      projectName: z
        .string()
        .min(1)
        .describe("Nome exato do projeto no Azure DevOps."),
    },
    async ({ projectName }) => {
      const project = await getProject(projectName);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(project, null, 2),
          },
        ],
      };
    }
  );
}