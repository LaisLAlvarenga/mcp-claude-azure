import { z } from "zod";

import {
  getProjectDefaults,
} from "../services/projectDefaults.js";

export function registerProjectDefaultsTools(server) {
  server.tool(
    "get_project_defaults",
    "Consulta os valores padrão configurados para criação de Work Items em um projeto.",
    {
      projectName: z
        .string()
        .min(1)
        .describe("Nome exato do projeto."),
    },

    async ({ projectName }) => {
      const defaults = getProjectDefaults(projectName);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                projectName,
                configured: Boolean(defaults),
                defaults,
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