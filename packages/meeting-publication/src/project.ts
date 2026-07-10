import {
  COLLECTIONS, type PrivateManifestSource, type PrivateOutcomeSource, type PrivateRuleProfileSource,
  type PublicApprovedOutcome, type PublicMeetingManifest, type PublicOutcomeApproval, type PublicRuleProfile, type StrongRef,
} from "./types.js";

export function projectRuleProfile(source: PrivateRuleProfileSource, createdAt: string): PublicRuleProfile {
  return {
    $type: COLLECTIONS.ruleProfile, profileId: source.profileId, version: source.version, name: source.name,
    quorum: source.quorum, debate: source.debate, voteMethods: [...source.voteMethods], tiePolicy: source.tiePolicy,
    overrides: source.overrides.map((override) => ({ ...override })), effectiveFrom: source.effectiveFrom, createdAt,
  };
}

export function projectMeetingManifest(source: PrivateManifestSource, publicFields: {
  publicMeetingId: string; organizationDid: string; ruleProfile: StrongRef; createdAt: string;
}): PublicMeetingManifest {
  return {
    $type: COLLECTIONS.manifest, publicMeetingId: publicFields.publicMeetingId,
    organizationDid: publicFields.organizationDid, title: source.title, scheduledStart: source.scheduledStart,
    ruleProfile: { ...publicFields.ruleProfile }, createdAt: publicFields.createdAt,
  };
}

export function projectApprovedOutcome(
  source: PrivateOutcomeSource,
  approval: PublicOutcomeApproval,
): PublicApprovedOutcome {
  const artifact: PublicApprovedOutcome = {
    $type: COLLECTIONS.approvedOutcome,
    publicOutcomeId: approval.publicOutcomeId,
    organizationDid: approval.organizationDid,
    meeting: { ...approval.meeting },
    publicMotionId: approval.publicMotionId,
    motionText: source.motionText,
    disposition: source.disposition,
    approvedByRole: approval.approvedByRole,
    approvedAt: approval.approvedAt,
    createdAt: approval.createdAt,
  };
  if (approval.includeAggregateTally) {
    artifact.tally = {
      yes: source.tally.yes,
      no: source.tally.no,
      abstain: source.tally.abstain,
    };
  }
  if (approval.supersedes) artifact.supersedes = { ...approval.supersedes };
  return artifact;
}
