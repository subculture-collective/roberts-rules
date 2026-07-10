import { readFile } from "node:fs/promises";
import { Agent, CredentialSession } from "@atproto/api";
import { approveCandidate, assertPublicArtifact, createCandidate, createPublicationJob, markPublishing } from "@subculture/roberts-rules-meeting-publication";
import { AtprotoPublicRepository } from "./atproto-repository.js";

const [jobPath] = process.argv.slice(2);
if (!process.env.ATPROTO_LOCAL_PDS_URL) throw new Error("ATPROTO_LOCAL_PDS_URL is required");
const service = new URL(process.env.ATPROTO_LOCAL_PDS_URL);
if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(service.hostname)) {
  throw new Error("LOCAL_PDS_REQUIRED");
}
if (!jobPath) throw new Error("Usage: smoke:local <public-artifact.json>");
const identifier = process.env.ATPROTO_LOCAL_IDENTIFIER;
const password = process.env.ATPROTO_LOCAL_PASSWORD;
if (!identifier || !password) throw new Error("Disposable local PDS credentials are required");

const session = new CredentialSession(service);
await session.login({ identifier, password });
const agent = new Agent(session);
const artifact: unknown = JSON.parse(await readFile(jobPath, "utf8"));
assertPublicArtifact(artifact);
const approved = approveCandidate(createCandidate("local-smoke", agent.assertDid, artifact), {
  id: "disposable-local-operator", role: "chair", at: new Date().toISOString(),
});
const job = markPublishing(createPublicationJob(approved));

const repository = new AtprotoPublicRepository({
  putRecord: async (input) => agent.com.atproto.repo.putRecord({ ...input, record: { ...input.record } }),
});
const result = await repository.publish(job);
process.stdout.write(`${JSON.stringify(result)}\n`);
