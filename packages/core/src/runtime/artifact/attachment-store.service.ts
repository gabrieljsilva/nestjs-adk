import { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import type { MediaPart } from "../../domain/model/messages/media-part.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { AbsentArtifactStorage } from "./absent-artifact-storage.adapter";
import { AttachmentNotStoredError } from "./errors/attachment-not-stored.error";

export class AttachmentStore {
	public constructor(private readonly storage: ArtifactStorage) {}

	public static none(): AttachmentStore {
		return new AttachmentStore(new AbsentArtifactStorage("This runtime was assembled without artifact storage."));
	}

	public async store(
		context: SessionContext,
		attachments: readonly MediaPart[],
		references: readonly AttachmentReference[] = [],
	): Promise<readonly AttachmentReference[]> {
		const stored: AttachmentReference[] = [];
		for (const part of attachments) stored.push(await this.storeReference(context, part));
		return [...stored, ...references];
	}

	private async storeReference(context: SessionContext, part: MediaPart): Promise<AttachmentReference> {
		const url = part.url;
		if (url !== undefined) return AttachmentReference.link(url, part.mediaType);
		return AttachmentReference.artifact(await this.putOne(context, part));
	}

	private async putOne(context: SessionContext, part: MediaPart) {
		try {
			const reference = await this.storage.put(context, new ArtifactContent(part.base64, part.mediaType));
			return reference.id;
		} catch (error) {
			throw new AttachmentNotStoredError(part.mediaType, error);
		}
	}
}
