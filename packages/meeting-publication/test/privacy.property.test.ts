import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { projectApprovedOutcome } from "../src/project.js";

describe("public projection privacy property", () => {
  it("never serializes private meeting, motion, or voter sentinels", () => {
    fc.assert(fc.property(fc.uuid(), fc.uuid(), fc.array(fc.uuid(), { maxLength: 8 }), (meetingId, motionId, voters) => {
      const output = projectApprovedOutcome(
        { internalMeetingId: meetingId, privateMotionId: motionId, motionText: "Public motion", disposition: "passed", tally: { yes: 1, no: 0, abstain: 0, voterIds: voters } },
        { publicOutcomeId: "00000000-0000-4000-8000-000000000001", publicMotionId: "00000000-0000-4000-8000-000000000002", organizationDid: "did:plc:organization", meeting: { uri: "at://did:plc:organization/tv.subcult.experimentalManifest/3jzfcijpj2z2a", cid: "bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4" }, approvedByRole: "chair", approvedAt: "2026-07-10T20:00:00.000Z", createdAt: "2026-07-10T20:00:00.000Z", includeAggregateTally: true },
      );
      const serialized = JSON.stringify(output);
      expect(serialized).not.toContain(meetingId);
      expect(serialized).not.toContain(motionId);
      for (const voter of voters) expect(serialized).not.toContain(voter);
    }), { numRuns: 100 });
  });
});
