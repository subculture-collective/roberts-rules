export const COLLECTIONS = {
  ruleProfile: "tv.subcult.experimentalRuleProfile",
  manifest: "tv.subcult.experimentalManifest",
  approvedOutcome: "tv.subcult.experimentalApprovedOutcome",
} as const;

export type ApprovalRole = "chair" | "secretary";
export type Disposition = "passed" | "failed" | "withdrawn" | "tabled" | "disposed";

export interface StrongRef { uri: string; cid: string }
export interface AggregateTally { yes: number; no: number; abstain: number }

export interface PublicRuleProfile {
  $type: typeof COLLECTIONS.ruleProfile;
  profileId: string;
  version: number;
  name: string;
  quorum: number;
  debate: string;
  voteMethods: string[];
  tiePolicy: string;
  overrides: RuleOverride[];
  effectiveFrom: string;
  createdAt: string;
}

export interface PublicMeetingManifest {
  $type: typeof COLLECTIONS.manifest;
  publicMeetingId: string;
  organizationDid: string;
  title: string;
  scheduledStart: string;
  ruleProfile: StrongRef;
  createdAt: string;
}

export interface PublicApprovedOutcome {
  $type: typeof COLLECTIONS.approvedOutcome;
  publicOutcomeId: string;
  organizationDid: string;
  meeting: StrongRef;
  publicMotionId: string;
  motionText: string;
  disposition: Disposition;
  tally?: AggregateTally;
  approvedByRole: ApprovalRole;
  approvedAt: string;
  createdAt: string;
  supersedes?: StrongRef;
}

export type PublicArtifact = PublicRuleProfile | PublicMeetingManifest | PublicApprovedOutcome;

export interface PrivateOutcomeSource {
  internalMeetingId: string;
  privateMotionId: string;
  motionText: string;
  disposition: Disposition;
  tally: AggregateTally & { voterIds?: string[] };
}

export interface PrivateRuleProfileSource {
  profileId: string; version: number; name: string; quorum: number; debate: string;
  voteMethods: string[]; tiePolicy: string; overrides: RuleOverride[]; effectiveFrom: string;
}

export interface RuleOverride { code: string; value: string }

export interface PrivateManifestSource {
  internalMeetingId: string; title: string; scheduledStart: string;
}

export interface PublicOutcomeApproval {
  publicOutcomeId: string;
  publicMotionId: string;
  organizationDid: string;
  meeting: StrongRef;
  approvedByRole: ApprovalRole;
  approvedAt: string;
  createdAt: string;
  includeAggregateTally: boolean;
  supersedes?: StrongRef;
}
