import { azureConfig } from "../config/azure.js";

async function azureRequest(endpoint, options = {}) {
  const response = await fetch(`${azureConfig.baseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...azureConfig.headers,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Azure DevOps API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

export async function getTeamMembers(projectName) {
  const encodedProjectName = encodeURIComponent(projectName);

  const teamsResponse = await azureRequest(
    `/${encodedProjectName}/_apis/teams?api-version=7.1`
  );

  const teams = teamsResponse.value || [];

  if (teams.length === 0) {
    return [];
  }

  const membersMap = new Map();

  for (const team of teams) {
    const membersResponse = await azureRequest(
      `/_apis/projects/${encodedProjectName}/teams/${team.id}/members?api-version=7.1`
    );

    for (const member of membersResponse.value || []) {
      const identity = member.identity;

      if (!identity?.id) {
        continue;
      }

      membersMap.set(identity.id, {
        id: identity.id,
        displayName: identity.displayName || null,
        uniqueName: identity.uniqueName || null,
      });
    }
  }

  return [...membersMap.values()];
}

export async function getAreaPaths(projectName) {
  const encodedProjectName = encodeURIComponent(projectName);

  const response = await azureRequest(
    `/${encodedProjectName}/_apis/wit/classificationnodes/Areas?$depth=10&api-version=7.1`
  );

  return flattenClassificationNodes(response, "Area");
}

export async function getIterationPaths(projectName) {
  const encodedProjectName = encodeURIComponent(projectName);

  const response = await azureRequest(
    `/${encodedProjectName}/_apis/wit/classificationnodes/Iterations?$depth=10&api-version=7.1`
  );

  return flattenClassificationNodes(response, "Iteration");
}

function flattenClassificationNodes(node, type, parentPath = null) {
  const currentPath = parentPath
    ? `${parentPath}\\${node.name}`
    : node.name;

  const result = [
    {
      id: node.id,
      name: node.name,
      path: currentPath,
      type,
    },
  ];

  for (const child of node.children || []) {
    result.push(
      ...flattenClassificationNodes(child, type, currentPath)
    );
  }

  return result;
}