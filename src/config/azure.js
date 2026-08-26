// CONFIGURAÇÃO DO AZURE DEVOPS.
// organization / pat / baseURL
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "../../.env"),
});

const organization = process.env.AZURE_DEVOPS_ORG;
const pat = process.env.AZURE_DEVOPS_PAT;

if (!organization || !pat) {
  throw new Error(
    "AZURE_DEVOPS_ORG e AZURE_DEVOPS_PAT precisam estar configurados no .env"
  );
}

const credentials = Buffer.from(`:${pat}`).toString("base64");

export const azureConfig = {
  organization,
  baseUrl: `https://dev.azure.com/${organization}`,
  headers: {
    Authorization: `Basic ${credentials}`,
    Accept: "application/json",
  },
};