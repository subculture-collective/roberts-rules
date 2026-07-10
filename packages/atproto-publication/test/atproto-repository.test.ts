import { describe, expect, it, vi } from "vitest";
import { approveCandidate, createCandidate, createPublicationJob, markFailed, markPublished, markPublishing, projectionHash } from "@subculture/roberts-rules-meeting-publication";
import { AtprotoPublicRepository } from "../src/atproto-repository.js";

const artifact = {
  $type: "tv.subcult.experimentalManifest" as const,
  publicMeetingId: "00000000-0000-4000-8000-000000000001", organizationDid: "did:plc:organization",
  title: "General meeting", scheduledStart: "2026-07-11T00:00:00.000Z",
  ruleProfile: { uri: "at://did:plc:organization/tv.subcult.experimentalRuleProfile/3jzfcijpj2z2a", cid: "bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4" },
  createdAt: "2026-07-10T20:00:00.000Z",
};

function approvedJob() {
  const approved = approveCandidate(createCandidate("candidate-1", "did:plc:organization", artifact),
    { id: "private-secretary", role: "secretary", at: "2026-07-10T20:01:00.000Z" });
  return markPublishing(createPublicationJob(approved, "3jzfcijpj2z2a"));
}

describe("AT Protocol repository adapter", () => {
  it("sends an exact validated idempotent putRecord request", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { uri: "at://did:plc:organization/tv.subcult.experimentalManifest/3jzfcijpj2z2a", cid: "bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4", validationStatus: "valid" } });
    const result = await new AtprotoPublicRepository({ putRecord }).publish(approvedJob());
    expect(putRecord).toHaveBeenCalledWith({ repo: "did:plc:organization", collection: "tv.subcult.experimentalManifest", rkey: "3jzfcijpj2z2a", validate: true, record: artifact });
    expect(result.validationStatus).toBe("valid");
  });

  it("fails closed when the PDS does not confirm validation", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { uri: "at://x", cid: "bafy", validationStatus: "unknown" } });
    await expect(new AtprotoPublicRepository({ putRecord }).publish(approvedJob())).rejects.toThrow("LEXICON_VALIDATION_REQUIRED");
  });

  it("does not call transport for a structurally forged job", async () => {
    const putRecord = vi.fn();
    const forged = { id: "forged", repositoryDid: "did:plc:organization", collection: artifact.$type, rkey: "3jzfcijpj2z2a", record: artifact,
      projectionHash: projectionHash(artifact), status: "publishing" as const, attemptCount: 1 };
    await expect(new AtprotoPublicRepository({ putRecord }).publish(forged)).rejects.toThrow("PUBLICATION_JOB_UNTRUSTED");
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("freezes authenticated routing so the collection cannot be changed", () => {
    const putRecord = vi.fn();
    const job = approvedJob();
    expect(() => { job.collection = "tv.subcult.experimentalApprovedOutcome"; }).toThrow(TypeError);
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("retries the identical request and stores the successful URI and CID", async () => {
    const response = { uri: "at://did:plc:organization/tv.subcult.experimentalManifest/3jzfcijpj2z2a", cid: "bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4", validationStatus: "valid" as const };
    const putRecord = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ data: response });
    const repository = new AtprotoPublicRepository({ putRecord });
    const firstAttempt = approvedJob();
    await expect(repository.publish(firstAttempt)).rejects.toThrow("network");
    const retry = markPublishing(markFailed(firstAttempt, "NETWORK"));
    const result = await repository.publish(retry);
    expect(putRecord.mock.calls[1]).toEqual(putRecord.mock.calls[0]);
    expect(retry.attemptCount).toBe(2);
    expect(markPublished(retry, result)).toMatchObject({ status: "published", uri: response.uri, cid: response.cid });
  });
});
