import { projectDefaults } from "../config/projectDefaults.js";

export function getProjectDefaults(projectName) {
  return projectDefaults[projectName] || null;
}