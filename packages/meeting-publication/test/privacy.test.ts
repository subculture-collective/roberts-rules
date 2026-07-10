import { describe, expect, it } from "vitest";
import { assertPublicArtifact } from "../src/privacy.js";

const valid = {
  $type: "tv.subcult.experimentalApprovedOutcome",
  publicOutcomeId: "00000000-0000-4000-8000-000000000001",
  organizationDid: "did:plc:organization",
  meeting: { uri: "at://did:plc:organization/tv.subcult.experimentalManifest/3jzfcijpj2z2a", cid: "bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4" },
  publicMotionId: "00000000-0000-4000-8000-000000000002",
  motionText: "Adopt the budget",
  disposition: "passed",
  approvedByRole: "chair",
  approvedAt: "2026-07-10T20:00:00.000Z",
  createdAt: "2026-07-10T20:00:00.000Z",
} as const;

describe("public artifact privacy guard", () => {
  it("accepts an exact valid public artifact", () => expect(() => assertPublicArtifact(valid)).not.toThrow());
  it.each(["actorId", "attendance", "ballots", "credential", "deviceId", "processedCommands"])(
    "rejects forbidden root field %s",
    (field) => expect(() => assertPublicArtifact({ ...valid, [field]: "private" })).toThrow("PUBLIC_FIELD_FORBIDDEN"),
  );
  it("rejects unknown nested fields", () =>
    expect(() => assertPublicArtifact({ ...valid, meeting: { ...valid.meeting, participantId: "private" } })).toThrow("PUBLIC_FIELD_FORBIDDEN"));
});
