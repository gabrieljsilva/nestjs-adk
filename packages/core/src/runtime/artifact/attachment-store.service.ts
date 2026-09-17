import { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import type { MediaPart } from "../../domain/model/messages/media-part.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { AttachmentNotStoredError } from "./errors/attachment-not-stored.error";

/**
 * Puts what was attached where it belongs, and answers with what the journal keeps.
 *
 * The journal records names. An image inlined into an event would be re read on every
 * rehydration, every status check and every projection, and a session would carry
 * megabytes of base64 through code that only wanted to know what was said. So bytes go to
 * artifact storage once and the event names them.
 *
 * A link is already a name. Nothing is written for it, because copying somebody else's URL
 * into storage would create a second copy of something this runtime does not own.
 *
 * A storage that refuses the write ends the command. There is no inline fallback here,
 * unlike an offloaded tool result: accepting the message without the image would record a
 * question about something nobody can look at any more.
 */
export class AttachmentStore {
	public constructor(private readonly storage: ArtifactStorage) {}

	/**
	 * A store with nowhere to write, for a caller assembled without artifact storage.
	 * It refuses rather than pretending to have written, which is the difference between a
	 * missing dependency and a lost image.
	 */
	public static none(): AttachmentStore {
		return new AttachmentStore(new UnwritableArtifactStorage());
	}

	/**
	 * A reference the caller already holds is passed through untouched, after everything
	 * that needed writing: it is already a name, and the only side that can turn it into
	 * bytes is the application that minted it.
	 */
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

/** Storage that takes nothing, which is the honest shape of having none. */
class UnwritableArtifactStorage extends ArtifactStorage {
	public async put(): Promise<ArtifactReference> {
		throw new Error("This runtime was assembled without artifact storage.");
	}

	public async read(): Promise<ArtifactContent> {
		throw new Error("This runtime was assembled without artifact storage.");
	}

	public async find(): Promise<ArtifactReference | undefined> {
		return undefined;
	}

	public async deleteAll(): Promise<void> {
		return undefined;
	}
}
