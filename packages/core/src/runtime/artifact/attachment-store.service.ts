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
		files: readonly ArtifactContent[] = [],
	): Promise<readonly AttachmentReference[]> {
		const stored: AttachmentReference[] = [];
		for (const part of attachments) stored.push(await this.storeReference(context, part));
		for (const file of files) stored.push(await this.attach(context, file));
		return [...stored, ...references];
	}

	public async attach(context: SessionContext, content: ArtifactContent): Promise<AttachmentReference> {
		const reference = await this.putOne(context, content);
		return AttachmentReference.artifact(reference.id, reference.mediaType);
	}

	private async storeReference(context: SessionContext, part: MediaPart): Promise<AttachmentReference> {
		const url = part.url;
		if (url !== undefined) return AttachmentReference.link(url, part.mediaType);
		return this.attach(context, ArtifactContent.fromBase64(part.base64, part.mediaType));
	}

	private async putOne(context: SessionContext, content: ArtifactContent): Promise<ArtifactReference> {
		try {
			return await this.storage.put(context, content);
		} catch (error) {
			throw new AttachmentNotStoredError(content.mediaType, error);
		}
	}
}
