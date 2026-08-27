// Ferramentas relacionadas aos work items.
import { z } from "zod";

import {
  searchWorkItems,
  getWorkItem,
} from "../services/azureDevOps.js";

import { getProjectDefaults } from "../services/projectDefaults.js";

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

  server.tool(
    "prepare_bug",
    "Prepara um Bug para revisão antes da criação no Azure DevOps. Nunca cria ou altera Work Items.",
    {
      projectName: z
        .string()
        .min(1)
        .describe("Nome exato do projeto no Azure DevOps."),

      title: z
        .string()
        .min(1)
        .describe("Título do Bug."),

      description: z
        .string()
        .optional()
        .describe("Descrição detalhada do Bug."),

      reproductionSteps: z
        .string()
        .optional()
        .describe("Passos necessários para reproduzir o Bug."),

      expectedResult: z
        .string()
        .optional()
        .describe("Resultado esperado."),

      actualResult: z
        .string()
        .optional()
        .describe("Comportamento atual observado."),

      assignedTo: z
        .string()
        .optional()
        .describe(
          "Nome exato da pessoa responsável pelo Bug. Caso não informado e não exista default, deverá ser solicitado."
        ),

      areaPath: z
        .string()
        .optional()
        .describe(
          "Area Path do Bug. Caso não informado, será utilizado o default do projeto quando existir."
        ),

      iterationPath: z
        .string()
        .optional()
        .describe(
          "Iteration Path do Bug. Caso não informado e não exista default, deverá ser solicitado."
        ),

      tag: z
        .string()
        .optional()
        .describe(
          "Tag do Bug. Caso não informado, será utilizado o default do projeto quando existir."
        ),
    },

    async ({
      projectName,
      title,
      description,
      reproductionSteps,
      expectedResult,
      actualResult,
      assignedTo,
      areaPath,
      iterationPath,
      tag,
    }) => {
      const defaults = getProjectDefaults(projectName);

      const resolvedAreaPath =
        areaPath ?? defaults?.areaPath ?? null;

      const resolvedIterationPath =
        iterationPath ?? defaults?.iterationPath ?? null;

      const resolvedAssignedTo =
        assignedTo ?? defaults?.assignedTo ?? null;

      const resolvedTag =
        tag ?? defaults?.tag ?? null;

      const missingFields = [];

      if (!resolvedAssignedTo) {
        missingFields.push("Assigned To");
      }

      if (!resolvedIterationPath) {
        missingFields.push("Iteration Path");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                action: "PREPARE_BUG",
                canCreate: false,

                project: projectName,

                bug: {
                  title,
                  description: description || null,
                  reproductionSteps: reproductionSteps || null,
                  expectedResult: expectedResult || null,
                  actualResult: actualResult || null,

                  assignedTo: resolvedAssignedTo,
                  areaPath: resolvedAreaPath,
                  iterationPath: resolvedIterationPath,
                  tag: resolvedTag,
                },

                missingFields,

                message:
                  missingFields.length > 0
                    ? `Não é possível finalizar o Bug ainda. É necessário informar: ${missingFields.join(
                        ", "
                      )}.`
                    : "Bug preparado para revisão. Nenhum registro foi criado no Azure DevOps. Aguarde confirmação explícita do usuário antes de criar.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}