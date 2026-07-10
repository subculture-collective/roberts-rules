import { describe, expect, it } from "vitest";
import { projectApprovedOutcome, projectMeetingManifest, projectRuleProfile } from "../src/project.js";

describe("approved outcome projection", () => {
  it("publishes only approved aggregate fields and omits tally by default", () => {
    const result = projectApprovedOutcome(
      {
        internalMeetingId: "private-meeting",
        privateMotionId: "private-motion",
        motionText: "Adopt the mutual aid budget",
        disposition: "passed",
        tally: { yes: 12, no: 2, abstain: 1, voterIds: ["private-voter"] },
      },
      {
        publicOutcomeId: "00000000-0000-4000-8000-000000000001",
        publicMotionId: "00000000-0000-4000-8000-000000000002",
        organizationDid: "did:plc:organization",
        meeting: { uri: "at://did:plc:organization/tv.subcult.experimentalManifest/3jzfcijpj2z2a", cid: "bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4" },
        approvedByRole: "secretary",
        approvedAt: "2026-07-10T20:00:00.000Z",
        createdAt: "2026-07-10T20:00:00.000Z",
        includeAggregateTally: false,
      },
    );

    expect(result).toEqual({
      $type: "tv.subcult.experimentalApprovedOutcome",
      publicOutcomeId: "00000000-0000-4000-8000-000000000001",
      organizationDid: "did:plc:organization",
      meeting: { uri: "at://did:plc:organization/tv.subcult.experimentalManifest/3jzfcijpj2z2a", cid: "bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4" },
      publicMotionId: "00000000-0000-4000-8000-000000000002",
      motionText: "Adopt the mutual aid budget",
      disposition: "passed",
      approvedByRole: "secretary",
      approvedAt: "2026-07-10T20:00:00.000Z",
      createdAt: "2026-07-10T20:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("private-");
  });
});

describe("other public projections", () => {
  it("projects a rule profile with structured overrides and fresh arrays", () => {
    const source = { profileId: "00000000-0000-4000-8000-000000000003", version: 1, name: "Default",
      quorum: 10, debate: "timed", voteMethods: ["counted"], tiePolicy: "fails", overrides: [{ code: "debate.limit", value: "120" }],
      effectiveFrom: "2026-07-10T20:00:00.000Z" };
    const output = projectRuleProfile(source, "2026-07-10T20:00:00.000Z");
    expect(output.overrides).toEqual([{ code: "debate.limit", value: "120" }]);
    expect(output.overrides).not.toBe(source.overrides);
  });

  it("projects a manifest without its private meeting ID", () => {
    const output = projectMeetingManifest({ internalMeetingId: "private-meeting", title: "General meeting", scheduledStart: "2026-07-11T00:00:00.000Z" },
      { publicMeetingId: "00000000-0000-4000-8000-000000000004", organizationDid: "did:plc:organization",
        ruleProfile: { uri: "at://did:plc:organization/tv.subcult.experimentalRuleProfile/3jzfcijpj2z2a", cid: "bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4" }, createdAt: "2026-07-10T20:00:00.000Z" });
    expect(JSON.stringify(output)).not.toContain("private-meeting");
    expect(Object.keys(output)).toEqual(["$type", "publicMeetingId", "organizationDid", "title", "scheduledStart", "ruleProfile", "createdAt"]);
  });
});
