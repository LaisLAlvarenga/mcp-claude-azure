// Ferramentas relacionadas aos work items.
import { z } from "zod";

import {
  searchWorkItems,
  getWorkItem,
  createWorkItem,
  ensureBugTags,
} from "../services/azureDevOps.js";

import { getProjectDefaults } from "../services/projectDefaults.js";

import {
  getAreaPaths,
  getCurrentProjectIteration,
  getIterationPaths,
  getTeamMembers,
} from "../services/projectSettings.js";

const MAX_SCREENSHOT_COUNT = 5;
const MAX_SCREENSHOT_SIZE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"];

const screenshotSchema = z.object({
  fileName: z.string().min(1).max(255).describe("Nome do arquivo de imagem, por exemplo: erro-login.png."),
  contentBase64: z.string().min(1).describe("Conteúdo binário da imagem codificado em Base64, sem o prefixo data:."),
  mimeType: z.enum(SUPPORTED_SCREENSHOT_TYPES).describe("Tipo da imagem: image/png, image/jpeg ou image/webp."),
  comment: z.string().max(1000).optional().describe("Comentário opcional exibido junto ao anexo no Azure DevOps."),
});

function validateScreenshots(attachments) {
  const invalidFields = [];
  const screenshots = [];

  if (!attachments) return { invalidFields, screenshots };

  for (const [index, attachment] of attachments.entries()) {
    const label = `Anexo ${index + 1}`;
    const normalizedBase64 = attachment.contentBase64.replace(/\s/g, "");

    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedBase64) || normalizedBase64.length % 4 !== 0) {
      invalidFields.push(`${label}: contentBase64 inválido.`);
      continue;
    }

    const content = Buffer.from(normalizedBase64, "base64");
    const detectedMimeType = detectImageMimeType(content);

    if (content.length === 0) {
      invalidFields.push(`${label}: a imagem não pode estar vazia.`);
    } else if (content.length > MAX_SCREENSHOT_SIZE_BYTES) {
      invalidFields.push(`${label}: excede o limite de 10 MB por imagem.`);
    } else if (!detectedMimeType) {
      invalidFields.push(`${label}: o conteúdo não é uma imagem PNG, JPEG ou WebP válida.`);
    } else if (detectedMimeType !== attachment.mimeType) {
      invalidFields.push(`${label}: mimeType não corresponde ao conteúdo da imagem.`);
    } else {
      screenshots.push({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        comment: attachment.comment,
        content,
        sizeBytes: content.length,
      });
    }
  }

  return { invalidFields, screenshots };
}

function detectImageMimeType(content) {
  if (
    content.length >= 8 &&
    content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }

  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    content.length >= 12 &&
    content.subarray(0, 4).toString("ascii") === "RIFF" &&
    content.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function screenshotMetadata(screenshots) {
  return screenshots.map(({ fileName, mimeType, comment, sizeBytes }) => ({
    fileName,
    mimeType,
    comment: comment || null,
    sizeBytes,
  }));
}

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
        "Nome da pessoa responsável pelo Bug. Opcional; quando informado, é validado entre os membros do projeto."
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
        "Iteration Path do Bug. Quando omitido, é usada a sprint ativa se o projeto tiver um único time."
      ),

    teamName: z
      .string()
      .optional()
      .describe(
        "Nome do time do Azure DevOps. Necessário quando o projeto possui mais de um time e a sprint ativa deve ser identificada."
      ),

    tag: z
      .string()
      .optional()
      .describe(
        "Tag do Bug. Caso não informado, será utilizado o default do projeto quando existir."
      ),

    attachments: z
      .array(screenshotSchema)
      .max(MAX_SCREENSHOT_COUNT)
      .optional()
      .describe("Prints de tela opcionais. Aceita no máximo 5 imagens PNG, JPEG ou WebP, de até 10 MB cada."),
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
    teamName,
    tag,
    attachments,
  }) => {
    const defaults = getProjectDefaults(projectName);
    const activeIteration = iterationPath
      ? null
      : await getCurrentProjectIteration(projectName, teamName);

    let resolvedAreaPath =
      areaPath ?? defaults?.areaPath ?? null;

    let resolvedIterationPath =
      iterationPath ?? activeIteration?.iterationPath ?? null;

    let resolvedAssignedTo =
      assignedTo ?? defaults?.assignedTo ?? null;

    const resolvedTag = ensureBugTags(tag ?? defaults?.tag);

    const missingFields = [];
    const invalidFields = [];
    const screenshotValidation = validateScreenshots(attachments);
    invalidFields.push(...screenshotValidation.invalidFields);

    // =====================================================
    // CAMPOS OBRIGATÓRIOS
    // =====================================================

    if (!description?.trim()) {
      missingFields.push("Descrição");
    }

    if (!resolvedIterationPath) {
      missingFields.push("Iteration Path");
    }

    if (!resolvedAreaPath) {
      missingFields.push("Area Path");
    }

    // =====================================================
    // VALIDAÇÃO DO ASSIGNED TO
    // =====================================================

    if (resolvedAssignedTo) {
      const teamMembers = await getTeamMembers(projectName);

      const normalizedAssignedTo =
        resolvedAssignedTo.trim().toLowerCase();

      const assignedUser = teamMembers.find(
        (member) =>
          member.displayName?.trim().toLowerCase() ===
          normalizedAssignedTo
      );

      if (!assignedUser) {
        invalidFields.push(
          `Assigned To: "${resolvedAssignedTo}" não foi encontrado no projeto ${projectName}.`
        );
      } else {
        resolvedAssignedTo = assignedUser.displayName;
      }
    }

    // =====================================================
    // VALIDAÇÃO DO AREA PATH
    // =====================================================

    if (resolvedAreaPath) {
      const areaPaths = await getAreaPaths(projectName);

      const normalizedAreaPath =
        resolvedAreaPath.trim().toLowerCase();

      const areaMatch = areaPaths.find(
        (area) =>
          area.path?.trim().toLowerCase() ===
          normalizedAreaPath
      );

      if (!areaMatch) {
        invalidFields.push(
          `Area Path: "${resolvedAreaPath}" não foi encontrado no projeto ${projectName}.`
        );
      } else {
        resolvedAreaPath = areaMatch.path;
      }
    }

    // =====================================================
    // VALIDAÇÃO E NORMALIZAÇÃO DO ITERATION PATH
    // =====================================================

    if (resolvedIterationPath) {
      const iterationPaths =
        await getIterationPaths(projectName);

      const normalizedIterationPath =
        resolvedIterationPath.trim().toLowerCase();

      // Primeiro tenta encontrar pelo caminho completo
      const exactMatch = iterationPaths.find(
        (iteration) =>
          iteration.path?.trim().toLowerCase() ===
          normalizedIterationPath
      );

      if (exactMatch) {
        resolvedIterationPath = exactMatch.path;
      } else {
        // Caso o usuário informe somente "Sprint 4"
        const shortMatch = iterationPaths.find(
          (iteration) =>
            iteration.name?.trim().toLowerCase() ===
            normalizedIterationPath
        );

        if (shortMatch) {
          resolvedIterationPath = shortMatch.path;
        } else {
          invalidFields.push(
            `Iteration Path: "${resolvedIterationPath}" não foi encontrado no projeto ${projectName}.`
  );

      }
    }
    }

    // =====================================================
    // RESULTADO
    // =====================================================

    const canCreate =
      missingFields.length === 0 &&
      invalidFields.length === 0;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              action: "PREPARE_BUG",

              canCreate,

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
                attachments: screenshotMetadata(screenshotValidation.screenshots),
              },

              iterationResolution: activeIteration
                ? {
                    source: activeIteration.iterationPath
                      ? "active_team_iteration"
                      : null,
                    reason: activeIteration.reason,
                    team: activeIteration.team || null,
                    availableTeams:
                      activeIteration.reason === "multiple_teams"
                        ? activeIteration.teams
                        : undefined,
                  }
                : null,

              missingFields,
              invalidFields,

              message:
                missingFields.length > 0
                  ? `Não é possível finalizar o Bug ainda. É necessário informar: ${missingFields.join(
                      ", "
                    )}.`
                  : invalidFields.length > 0
                    ? `Existem valores inválidos que precisam ser corrigidos: ${invalidFields.join(
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

  server.tool(
    "create_bug",
    "Cria um Bug no Azure DevOps somente depois de confirmação explícita. Use após prepare_bug retornar canCreate: true.",
    {
      projectName: z.string().min(1).describe("Nome exato do projeto no Azure DevOps."),
      title: z.string().min(1).describe("Título do Bug aprovado."),
      description: z.string().min(1).describe("Descrição detalhada aprovada."),
      reproductionSteps: z.string().optional().describe("Passos para reprodução aprovados, quando informados."),
      expectedResult: z.string().optional().describe("Resultado esperado aprovado, quando informado."),
      actualResult: z.string().optional().describe("Comportamento atual aprovado, quando informado."),
      assignedTo: z.string().min(1).optional().describe("Responsável aprovado, quando houver."),
      areaPath: z.string().min(1).describe("Area Path aprovado."),
      iterationPath: z.string().min(1).describe("Iteration Path aprovado."),
      tag: z.string().optional().describe("Tag aprovada."),
      attachments: z.array(screenshotSchema).max(MAX_SCREENSHOT_COUNT).optional().describe("Prints de tela opcionais validados no prepare_bug. Reenvie os mesmos anexos aprovados."),
      confirmed: z.literal(true).describe("Deve ser true somente após o usuário confirmar explicitamente o bug preparado."),
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
      attachments,
    }) => {
      const screenshotValidation = validateScreenshots(attachments);
      const validation = await validateBugFields({
        projectName,
        description,
        reproductionSteps,
        expectedResult,
        actualResult,
        assignedTo,
        areaPath,
        iterationPath,
      });

      validation.invalidFields.push(...screenshotValidation.invalidFields);

      if (validation.missingFields.length > 0 || validation.invalidFields.length > 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              action: "CREATE_BUG",
              created: false,
              project: projectName,
              missingFields: validation.missingFields,
              invalidFields: validation.invalidFields,
              message: "O Bug não foi criado porque os dados aprovados não passaram na validação atual.",
            }, null, 2),
          }],
        };
      }

      const bug = await createWorkItem({
        projectName,
        workItemType: "Bug",
        title,
        description,
        reproductionSteps,
        expectedResult,
        actualResult,
        assignedTo: validation.assignedTo,
        areaPath: validation.areaPath,
        iterationPath: validation.iterationPath,
        tag,
        attachments: screenshotValidation.screenshots,
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            action: "CREATE_BUG",
            created: true,
            bug,
            attachments: screenshotMetadata(screenshotValidation.screenshots),
            message: "Bug criado com sucesso no Azure DevOps.",
          }, null, 2),
        }],
      };
    }
  );
}

async function validateBugFields({
  projectName,
  description,
  reproductionSteps,
  expectedResult,
  actualResult,
  assignedTo,
  areaPath,
  iterationPath,
}) {
  const missingFields = [];
  const invalidFields = [];

  if (!description?.trim()) missingFields.push("Descrição");
  if (!areaPath?.trim()) missingFields.push("Area Path");
  if (!iterationPath?.trim()) missingFields.push("Iteration Path");

  let resolvedAssignedTo = assignedTo;
  let resolvedAreaPath = areaPath;
  let resolvedIterationPath = iterationPath;

  if (resolvedAssignedTo?.trim()) {
    const teamMembers = await getTeamMembers(projectName);
    const assignedUser = teamMembers.find(
      (member) => member.displayName?.trim().toLowerCase() === resolvedAssignedTo.trim().toLowerCase()
    );

    if (!assignedUser) {
      invalidFields.push(`Assigned To: "${resolvedAssignedTo}" não foi encontrado no projeto ${projectName}.`);
    } else {
      resolvedAssignedTo = assignedUser.displayName;
    }
  }

  if (resolvedAreaPath?.trim()) {
    const areaPaths = await getAreaPaths(projectName);
    const areaMatch = areaPaths.find(
      (area) => area.path?.trim().toLowerCase() === resolvedAreaPath.trim().toLowerCase()
    );

    if (!areaMatch) {
      invalidFields.push(`Area Path: "${resolvedAreaPath}" não foi encontrado no projeto ${projectName}.`);
    } else {
      resolvedAreaPath = areaMatch.path;
    }
  }

  if (resolvedIterationPath?.trim()) {
    const iterationPaths = await getIterationPaths(projectName);
    const normalizedIterationPath = resolvedIterationPath.trim().toLowerCase();
    const iterationMatch = iterationPaths.find(
      (iteration) => iteration.path?.trim().toLowerCase() === normalizedIterationPath
    ) || iterationPaths.find(
      (iteration) => iteration.name?.trim().toLowerCase() === normalizedIterationPath
    );

    if (!iterationMatch) {
      invalidFields.push(`Iteration Path: "${resolvedIterationPath}" não foi encontrado no projeto ${projectName}.`);
    } else {
      resolvedIterationPath = iterationMatch.path;
    }
  }

  return {
    missingFields,
    invalidFields,
    assignedTo: resolvedAssignedTo,
    areaPath: resolvedAreaPath,
    iterationPath: resolvedIterationPath,
  };
}
