import { experimentalApprovedOutcome, experimentalManifest, experimentalRuleProfile } from "./generated/tv/subcult.js";
import { COLLECTIONS, type PublicArtifact } from "./types.js";

const allowed: Record<string, ReadonlySet<string>> = {
  [COLLECTIONS.ruleProfile]: new Set(["$type", "profileId", "version", "name", "quorum", "debate", "voteMethods", "tiePolicy", "overrides", "effectiveFrom", "createdAt"]),
  [COLLECTIONS.manifest]: new Set(["$type", "publicMeetingId", "organizationDid", "title", "scheduledStart", "ruleProfile", "createdAt"]),
  [COLLECTIONS.approvedOutcome]: new Set(["$type", "publicOutcomeId", "organizationDid", "meeting", "publicMotionId", "motionText", "disposition", "tally", "approvedByRole", "approvedAt", "createdAt", "supersedes"]),
};
const nested = new Map<string, ReadonlySet<string>>([
  ["meeting", new Set(["uri", "cid"])], ["ruleProfile", new Set(["uri", "cid"])],
  ["supersedes", new Set(["uri", "cid"])], ["tally", new Set(["yes", "no", "abstain"])],
  ["overrides", new Set(["code", "value"])],
]);

function assertExactKeys(value: Record<string, unknown>, permitted: ReadonlySet<string>, path: string): void {
  for (const key of Object.keys(value)) {
    if (!permitted.has(key)) throw new Error(`PUBLIC_FIELD_FORBIDDEN:${path}${key}`);
    const childKeys = nested.get(key);
    const child = value[key];
    if (childKeys && Array.isArray(child)) {
      child.forEach((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`PUBLIC_FIELD_FORBIDDEN:${path}${key}.${index}`);
        assertExactKeys(entry as Record<string, unknown>, childKeys, `${path}${key}.${index}.`);
      });
    } else if (childKeys && child && typeof child === "object") {
      assertExactKeys(child as Record<string, unknown>, childKeys, `${path}${key}.`);
    }
  }
}

export function assertPublicArtifact(value: unknown): asserts value is PublicArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PUBLIC_ARTIFACT_INVALID");
  const record = value as Record<string, unknown>;
  const type = record.$type;
  if (typeof type !== "string" || !allowed[type]) throw new Error("PUBLIC_ARTIFACT_TYPE_INVALID");
  assertExactKeys(record, allowed[type], "");
  if (type === COLLECTIONS.approvedOutcome) {
    if (record.approvedByRole !== "chair" && record.approvedByRole !== "secretary") throw new Error("PUBLIC_APPROVAL_ROLE_INVALID");
    if (!new Set(["passed", "failed", "withdrawn", "tabled", "disposed"]).has(String(record.disposition))) throw new Error("PUBLIC_DISPOSITION_INVALID");
  }
  if (type === COLLECTIONS.ruleProfile) experimentalRuleProfile.$validate(record);
  else if (type === COLLECTIONS.manifest) experimentalManifest.$validate(record);
  else experimentalApprovedOutcome.$validate(record);
}
