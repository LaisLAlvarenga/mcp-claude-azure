// Arquivo que centraliza os registros das tools.

import { registerProjectTools } from "./projects.js";
import { registerWorkItemTools } from "./workItems.js";
import { registerProjectDefaultsTools } from "./projectDefaults.js";

export function registerTools(server) {
  registerProjectTools(server);

  registerWorkItemTools(server);

  registerProjectDefaultsTools(server);
}