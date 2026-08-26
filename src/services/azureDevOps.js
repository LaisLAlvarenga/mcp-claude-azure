// comunicação http com a api do azure devops
// Ex: getProjects / createWorkItem / getWorkItem / updateWorkItem / deleteWorkItem

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

export async function getProjects() {
  const data = await azureRequest(
    "/_apis/projects?api-version=7.1"
  );

  return data.value.map((project) => ({
    id: project.id,
    name: project.name,
    state: project.state,
    url: project.url,
  }));
}

export async function getProject(projectName) {
  const encodedProjectName = encodeURIComponent(projectName);

  const project = await azureRequest(
    `/_apis/projects/${encodedProjectName}?api-version=7.1`
  );

  return {
    id: project.id,
    name: project.name,
    state: project.state,
    description: project.description || null,
    visibility: project.visibility,
    url: project.url,
    revision: project.revision,
    lastUpdateTime: project.lastUpdateTime,
  };
}

export async function searchWorkItems({
  projectName,
  searchTerm,
  workItemType,
  state,
  top = 20,
}) {
  const escapedProjectName = projectName.replace(/'/g, "''");
  const escapedSearchTerm = searchTerm.replace(/'/g, "''");

  const conditions = [
    `[System.TeamProject] = '${escapedProjectName}'`,
  ];

  if (workItemType) {
    const escapedType = workItemType.replace(/'/g, "''");

    conditions.push(
      `[System.WorkItemType] = '${escapedType}'`
    );
  }

  if (state) {
    const escapedState = state.replace(/'/g, "''");

    conditions.push(
      `[System.State] = '${escapedState}'`
    );
  }

  conditions.push(`
    (
      [System.Title] Contains '${escapedSearchTerm}'
      OR
      [System.Description] Contains '${escapedSearchTerm}'
    )
  `);

  const wiql = `
    SELECT
      [System.Id],
      [System.Title],
      [System.WorkItemType],
      [System.State],
      [System.AssignedTo],
      [System.CreatedDate],
      [System.ChangedDate]
    FROM WorkItems
    WHERE
      ${conditions.join("\n      AND ")}
    ORDER BY [System.ChangedDate] DESC
  `;

  const encodedProjectName = encodeURIComponent(projectName);

  const response = await azureRequest(
    `/${encodedProjectName}/_apis/wit/wiql?api-version=7.1`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: wiql,
        $top: Math.min(Math.max(top, 1), 100),
      }),
    }
  );

  const references = response.workItems || [];

  if (references.length === 0) {
    return [];
  }

  const ids = references.map((item) => item.id);

  return getWorkItems(ids);
}

export async function getWorkItems(ids) {
  if (!ids || ids.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(ids)];

  const idsParam = uniqueIds.join(",");

  const response = await azureRequest(
    `/_apis/wit/workitems?ids=${idsParam}&$expand=fields&api-version=7.1`
  );

  return response.value.map(formatWorkItem);
}

export async function getWorkItem(id) {
  const response = await azureRequest(
    `/_apis/wit/workitems/${id}?$expand=fields&api-version=7.1`
  );

  return formatWorkItem(response);
}

function formatWorkItem(workItem) {
  const fields = workItem.fields || {};

  return {
    id: workItem.id,
    rev: workItem.rev,
    url: workItem.url,

    project: fields["System.TeamProject"] || null,
    workItemType: fields["System.WorkItemType"] || null,
    title: fields["System.Title"] || null,
    state: fields["System.State"] || null,

    assignedTo: fields["System.AssignedTo"]
      ? {
          displayName: fields["System.AssignedTo"].displayName,
          uniqueName: fields["System.AssignedTo"].uniqueName,
        }
      : null,

    description: fields["System.Description"] || null,

    areaPath: fields["System.AreaPath"] || null,
    iterationPath: fields["System.IterationPath"] || null,

    createdDate: fields["System.CreatedDate"] || null,
    changedDate: fields["System.ChangedDate"] || null,

    fields,
  };
}