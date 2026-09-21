import assert from "node:assert/strict";
import test from "node:test";

test("createWorkItem envia o print e o vincula ao Bug", async () => {
  process.env.AZURE_DEVOPS_ORG = "test-org";
  process.env.AZURE_DEVOPS_PAT = "test-pat";

  const { createWorkItem } = await import("../src/services/azureDevOps.js");
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });

    if (String(url).includes("/_apis/wit/attachments?")) {
      return new Response(
        JSON.stringify({ url: "https://dev.azure.com/test-org/_apis/wit/attachments/screenshot-id" }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        id: 42,
        rev: 1,
        url: "https://dev.azure.com/test-org/_apis/wit/workItems/42",
        fields: {
          "System.TeamProject": "Project QA",
          "System.WorkItemType": "Bug",
          "System.Title": "Falha no login",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const screenshot = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const bug = await createWorkItem({
      projectName: "Project QA",
      workItemType: "Bug",
      title: "Falha no login",
      description: "A tela apresenta erro.",
      areaPath: "Project QA",
      iterationPath: "Project QA\\Sprint 1",
      attachments: [{
        fileName: "print-login.png",
        mimeType: "image/png",
        content: screenshot,
        comment: "Tela exibida após o login.",
      }],
    });

    assert.equal(bug.id, 42);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /fileName=print-login.png/);
    assert.equal(calls[0].options.headers["Content-Type"], "image/png");
    assert.deepEqual(Buffer.from(calls[0].options.body), screenshot);

    const patchDocument = JSON.parse(calls[1].options.body);
    assert.deepEqual(patchDocument.at(-1), {
      op: "add",
      path: "/relations/-",
      value: {
        rel: "AttachedFile",
        url: "https://dev.azure.com/test-org/_apis/wit/attachments/screenshot-id",
        attributes: { comment: "Tela exibida após o login." },
      },
    });

    calls.length = 0;
    await createWorkItem({
      projectName: "Project QA",
      workItemType: "Bug",
      title: "Bug sem print",
      description: "A tela apresenta erro.",
      areaPath: "Project QA",
      iterationPath: "Project QA\\Sprint 1",
    });

    assert.equal(calls.length, 1);
    assert.ok(!JSON.parse(calls[0].options.body).some((operation) => operation.path === "/relations/-"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
