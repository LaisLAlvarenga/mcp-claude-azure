// Ferramentas relacionadas aos work items.
import { z } from "zod";

import {
  searchWorkItems,
  getWorkItem,
} from "../services/azureDevOps.js";

export function registerWorkItemTools(server) {
  server.tool(
    "search_work_items",
    "Pesquisa Work Items dentro de um projeto específico do Azure DevOps.",
    {
      projectName: z
        .string()
        .min(1)
        .describe("Nome exato do projeto no Azure DevOps."),

      searchTerm: z
        .string()
        .min(1)
        .describe(
          "Termo pesquisado no título e na descrição do Work Item."
        ),

      workItemType: z
        .string()
        .optional()
        .describe(
          "Tipo do Work Item. Exemplos: Bug, User Story, Task, Test Case."
        ),

      state: z
        .string()
        .optional()
        .describe(
          "Estado do Work Item. Exemplos: New, Active, Resolved, Closed."
        ),

      top: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          "Quantidade máxima de resultados. Padrão: 20. Máximo: 100."
        ),
    },

    async ({
      projectName,
      searchTerm,
      workItemType,
      state,
      top,
    }) => {
      const workItems = await searchWorkItems({
        projectName,
        searchTerm,
        workItemType,
        state,
        top,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(workItems, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "get_work_item",
    "Consulta um Work Item específico pelo ID.",
    {
      id: z
        .number()
        .int()
        .positive()
        .describe("ID do Work Item no Azure DevOps."),
    },

    async ({ id }) => {
      const workItem = await getWorkItem(id);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(workItem, null, 2),
          },
        ],
      };
    }
  );
}