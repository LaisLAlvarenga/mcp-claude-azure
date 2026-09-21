import { z } from "zod";

import { getTeamMembers } from "../services/projectSettings.js";

export function registerProjectSettingsTools(server) {
  server.tool(
    "list_project_members",
    "Lista os membros associados aos times de um projeto do Azure DevOps, sem duplicidades.",
    {
      projectName: z
        .string()
        .min(1)
        .describe("Nome exato do projeto no Azure DevOps."),
    },
    async ({ projectName }) => {
      const members = await getTeamMembers(projectName);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(members, null, 2),
          },
        ],
      };
    }
  );
}
