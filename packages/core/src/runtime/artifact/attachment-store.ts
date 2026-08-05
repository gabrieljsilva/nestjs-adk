import type { ArtifactId } from "../../common/identity/artifact-id";
import type { SessionId } from "../../common/identity/session-id";
import { ArtifactStorage } from "../../contracts/artifact-storage";
import { ArtifactContent } from "../../domain/artifact/artifact-content";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference";
import type { MediaPart } from "../../domain/model/media-part";
import { AttachmentNotStoredError } from "./errors/attachment-not-stored.error";

/**
 * Puts what the user attached where bytes belong, and answers with what the journal keeps.
 *
 * The journal records ids. An image inlined into an event would be re read on every
 * rehydration, every status check and every projection, and a session would carry
 * megabytes of base64 through code that only wanted to know what was said. So the bytes
 * go to artifact storage once and the event names them.
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

	public async store(sessionId: SessionId, attachments: readonly MediaPart[]): Promise<readonly ArtifactId[]> {
		const ids: ArtifactId[] = [];
		for (const part of attachments) ids.push(await this.putOne(sessionId, part));
		return ids;
	}

	private async putOne(sessionId: SessionId, part: MediaPart): Promise<ArtifactId> {
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
