import { assertAuthenticCandidate, projectionHash, type PublicationCandidate } from "./approval.js";
import type { PublicArtifact } from "./types.js";
import { TID } from "@atproto/common-web";

const authenticJobs = new WeakSet<object>();
const routes = new WeakMap<object, { repositoryDid: string; collection: string; rkey: string }>();
function authentic<T extends PublicationJob>(job: T): T {
  routes.set(job, { repositoryDid: job.repositoryDid, collection: job.collection, rkey: job.rkey });
  Object.freeze(job); authenticJobs.add(job); return job;
}

export interface PublicationJob {
  id: string; repositoryDid: string; collection: PublicArtifact["$type"]; rkey: string;
  record: PublicArtifact; projectionHash: string; status: "approved" | "publishing" | "published" | "failed";
  attemptCount: number; uri?: string; cid?: string; validationStatus?: "valid"; failureCategory?: string;
}

export function createPublicationJob(candidate: PublicationCandidate, rkey = TID.nextStr()): PublicationJob {
  if (candidate.status !== "approved") throw new Error("PUBLICATION_NOT_APPROVED");
  assertAuthenticCandidate(candidate);
  if (projectionHash(candidate.artifact) !== candidate.projectionHash) throw new Error("PUBLICATION_CONTENT_CHANGED");
  if (!TID.is(rkey)) throw new Error("PUBLICATION_RKEY_INVALID");
  return authentic({ id: candidate.id, repositoryDid: candidate.repositoryDid, collection: candidate.artifact.$type,
    rkey, record: structuredClone(candidate.artifact), projectionHash: candidate.projectionHash, status: "approved", attemptCount: 0 });
}

export function markPublishing(job: PublicationJob): PublicationJob & { status: "publishing" } {
  if (job.status !== "approved" && job.status !== "failed") throw new Error("PUBLICATION_TRANSITION_INVALID");
  assertAuthenticPublicationJob(job);
  return authentic({ ...job, status: "publishing", attemptCount: job.attemptCount + 1, failureCategory: undefined });
}

export function markPublished(job: PublicationJob, result: { uri: string; cid: string; validationStatus: "valid" }): PublicationJob & { status: "published" } {
  if (job.status !== "publishing") throw new Error("PUBLICATION_TRANSITION_INVALID");
  assertAuthenticPublicationJob(job);
  return authentic({ ...job, ...result, status: "published" });
}

export function markFailed(job: PublicationJob, failureCategory: string): PublicationJob & { status: "failed" } {
  if (job.status !== "publishing") throw new Error("PUBLICATION_TRANSITION_INVALID");
  assertAuthenticPublicationJob(job);
  return authentic({ ...job, status: "failed", failureCategory });
}

export function assertAuthenticPublicationJob(job: PublicationJob): void {
  if (!authenticJobs.has(job)) throw new Error("PUBLICATION_JOB_UNTRUSTED");
  const route = routes.get(job);
  if (!route || route.repositoryDid !== job.repositoryDid || route.collection !== job.collection || route.rkey !== job.rkey || !TID.is(job.rkey)) {
    throw new Error("PUBLICATION_ROUTE_CHANGED");
  }
}
