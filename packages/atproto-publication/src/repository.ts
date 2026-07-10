import type { PublicationJob } from "@subculture/roberts-rules-meeting-publication";

export interface PublishingPublicationJob extends PublicationJob { status: "publishing" }
export interface PublicationResult { uri: string; cid: string; validationStatus: "valid" }
export interface PublicRepository { publish(job: PublishingPublicationJob): Promise<PublicationResult> }

export interface PutRecordTransport {
  putRecord(input: {
    repo: string; collection: string; rkey: string; validate: true; record: PublicationJob["record"];
  }): Promise<{ data: { uri: string; cid: string; validationStatus?: string } }>;
}
