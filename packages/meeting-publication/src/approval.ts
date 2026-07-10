import { createHash } from "node:crypto";
import { assertPublicArtifact } from "./privacy.js";
import type { ApprovalRole, PublicArtifact } from "./types.js";

export type CandidateStatus = "draft" | "approved" | "publishing" | "published" | "failed";
export interface PublicationCandidate {
  id: string; repositoryDid: string; artifact: PublicArtifact; projectionHash: string; status: CandidateStatus;
  approverId?: string; approvedByRole?: ApprovalRole; approvedAt?: string;
}
const authenticCandidates = new WeakSet<object>();
const approvedCandidates = new WeakSet<object>();
function authentic<T extends PublicationCandidate>(candidate: T, approved = false): T {
  Object.freeze(candidate); authenticCandidates.add(candidate); if (approved) approvedCandidates.add(candidate); return candidate;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function projectionHash(artifact: PublicArtifact): string {
  assertPublicArtifact(artifact);
  return createHash("sha256").update(canonical(artifact)).digest("hex");
}

export function createCandidate(id: string, repositoryDid: string, artifact: PublicArtifact): PublicationCandidate {
  return authentic({ id, repositoryDid, artifact: structuredClone(artifact), projectionHash: projectionHash(artifact), status: "draft" });
}

export function approveCandidate(candidate: PublicationCandidate, approver: { id: string; role: string; at: string }): PublicationCandidate {
  if (candidate.status !== "draft") throw new Error("PUBLICATION_TRANSITION_INVALID");
  if (!authenticCandidates.has(candidate)) throw new Error("PUBLICATION_CANDIDATE_UNTRUSTED");
  if (approver.role !== "chair" && approver.role !== "secretary") throw new Error("PUBLICATION_ROLE_FORBIDDEN");
  if (projectionHash(candidate.artifact) !== candidate.projectionHash) throw new Error("PUBLICATION_CONTENT_CHANGED");
  return authentic({ ...candidate, status: "approved", approverId: approver.id, approvedByRole: approver.role as ApprovalRole, approvedAt: approver.at }, true);
}

export function assertAuthenticCandidate(candidate: PublicationCandidate): void {
  if (!approvedCandidates.has(candidate)) throw new Error("PUBLICATION_APPROVAL_UNTRUSTED");
}
