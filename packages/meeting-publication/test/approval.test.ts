import { describe, expect, it } from "vitest";
import { approveCandidate, createCandidate } from "../src/approval.js";
import { createPublicationJob, markFailed, markPublished, markPublishing } from "../src/outbox.js";

const artifact = {
  $type: "tv.subcult.experimentalManifest" as const,
  publicMeetingId: "00000000-0000-4000-8000-000000000001", organizationDid: "did:plc:organization",
  title: "General meeting", scheduledStart: "2026-07-11T00:00:00.000Z",
  ruleProfile: { uri: "at://did:plc:organization/tv.subcult.experimentalRuleProfile/3jzfcijpj2z2a", cid: "bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4" },
  createdAt: "2026-07-10T20:00:00.000Z",
};

describe("publication approval and outbox", () => {
  it("rejects approval by roles outside chair and secretary", () => {
    const candidate = createCandidate("candidate-1", "did:plc:organization", artifact);
    expect(() => approveCandidate(candidate, { id: "operator", role: "technicalOperator", at: "2026-07-10T20:01:00.000Z" })).toThrow("PUBLICATION_ROLE_FORBIDDEN");
  });
  it("requires exact approval and reuses its rkey across retries", () => {
    const candidate = approveCandidate(createCandidate("candidate-1", "did:plc:organization", artifact),
      { id: "private-secretary", role: "secretary", at: "2026-07-10T20:01:00.000Z" });
    const job = createPublicationJob(candidate, "3jzfcijpj2z2a");
    const failed = markFailed(markPublishing(job), "NETWORK");
    const retry = markPublishing(failed);
    expect(retry.rkey).toBe(job.rkey);
    expect(retry.attemptCount).toBe(2);
    expect(JSON.stringify(retry)).not.toContain("private-secretary");
  });

  it("rejects changed content after approval", () => {
    const approved = approveCandidate(createCandidate("candidate-1", "did:plc:organization", artifact),
      { id: "secretary", role: "secretary", at: "2026-07-10T20:01:00.000Z" });
    approved.artifact.title = "Changed";
    expect(() => createPublicationJob(approved, "3jzfcijpj2z2a")).toThrow("PUBLICATION_CONTENT_CHANGED");
  });

  it("rejects a non-TID record key", () => {
    const approved = approveCandidate(createCandidate("candidate-1", "did:plc:organization", artifact),
      { id: "secretary", role: "secretary", at: "2026-07-10T20:01:00.000Z" });
    expect(() => createPublicationJob(approved, "not-a-tid")).toThrow("PUBLICATION_RKEY_INVALID");
  });

  it("rejects a structurally forged approved candidate", () => {
    const candidate = createCandidate("candidate-1", "did:plc:organization", artifact);
    const forged = { ...candidate, status: "approved" as const, approvedByRole: "chair" as const, approverId: "forged", approvedAt: "2026-07-10T20:01:00.000Z" };
    expect(() => createPublicationJob(forged, "3jzfcijpj2z2a")).toThrow("PUBLICATION_APPROVAL_UNTRUSTED");
  });

  it("prevents changing a draft candidate into an approved candidate in place", () => {
    const candidate = createCandidate("candidate-1", "did:plc:organization", artifact);
    expect(() => { candidate.status = "approved"; }).toThrow(TypeError);
    expect(() => createPublicationJob(candidate, "3jzfcijpj2z2a")).toThrow("PUBLICATION_NOT_APPROVED");
  });

  it("retains the repository URI and CID on a published job", () => {
    const approved = approveCandidate(createCandidate("candidate-1", "did:plc:organization", artifact),
      { id: "secretary", role: "secretary", at: "2026-07-10T20:01:00.000Z" });
    const published = markPublished(markPublishing(createPublicationJob(approved, "3jzfcijpj2z2a")),
      { uri: "at://did:plc:organization/tv.subcult.experimentalManifest/3jzfcijpj2z2a", cid: "bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4", validationStatus: "valid" });
    expect(published).toMatchObject({ status: "published", uri: expect.stringContaining("experimentalManifest"), cid: expect.stringMatching(/^bafy/) });
  });
});
