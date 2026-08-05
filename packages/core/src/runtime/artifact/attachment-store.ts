import type { SessionId } from "../../common/identity/session-id";
import { ArtifactStorage } from "../../contracts/artifact-storage";
import { ArtifactContent } from "../../domain/artifact/artifact-content";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference";
import { AttachmentReference } from "../../domain/model/attachment-reference";
import type { MediaPart } from "../../domain/model/media-part";
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

	public async store(sessionId: SessionId, attachments: readonly MediaPart[]): Promise<readonly AttachmentReference[]> {
		const references: AttachmentReference[] = [];
		for (const part of attachments) references.push(await this.referenceOf(sessionId, part));
		return references;
	}

	private async referenceOf(sessionId: SessionId, part: MediaPart): Promise<AttachmentReference> {
		const url = part.url;
		if (url !== undefined) return AttachmentReference.link(url, part.mediaType);
		return AttachmentReference.artifact(await this.putOne(sessionId, part));
	}

	private async putOne(sessionId: SessionId, part: MediaPart) {
		try {
			const reference = await this.storage.put(sessionId, ArtifactContent.of(part.base64, part.mediaType));
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
