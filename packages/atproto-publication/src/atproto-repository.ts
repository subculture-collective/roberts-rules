import { assertAuthenticPublicationJob, assertPublicArtifact, projectionHash } from "@subculture/roberts-rules-meeting-publication";
import type { PublishingPublicationJob, PublicRepository, PublicationResult, PutRecordTransport } from "./repository.js";

export class AtprotoPublicRepository implements PublicRepository {
  constructor(private readonly transport: PutRecordTransport) {}

  async publish(job: PublishingPublicationJob): Promise<PublicationResult> {
    if (job.status !== "publishing") throw new Error("PUBLICATION_NOT_PUBLISHING");
    assertAuthenticPublicationJob(job);
    assertPublicArtifact(job.record);
    if (projectionHash(job.record) !== job.projectionHash) throw new Error("PUBLICATION_CONTENT_CHANGED");
    if (job.collection !== job.record.$type) throw new Error("PUBLICATION_COLLECTION_MISMATCH");
    if ("organizationDid" in job.record && job.record.organizationDid !== job.repositoryDid) throw new Error("REPOSITORY_DID_MISMATCH");
    const response = await this.transport.putRecord({
      repo: job.repositoryDid, collection: job.collection, rkey: job.rkey, validate: true, record: job.record,
    });
    if (response.data.validationStatus !== "valid") throw new Error("LEXICON_VALIDATION_REQUIRED");
    return { uri: response.data.uri, cid: response.data.cid, validationStatus: "valid" };
  }
}
