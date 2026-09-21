// Arquivo que centraliza os registros das tools.

import { registerProjectTools } from "./projects.js";
import { registerWorkItemTools } from "./workItems.js";
import { registerProjectDefaultsTools } from "./projectDefaults.js";
import { registerProjectSettingsTools } from "./projectSettings.js";

export function registerTools(server) {
  registerProjectTools(server);

  registerWorkItemTools(server);

  registerProjectDefaultsTools(server);

  registerProjectSettingsTools(server);
}
