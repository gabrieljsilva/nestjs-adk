import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { ArtifactNotExplorableError } from "./errors/artifact-not-explorable.error";

export class LoadedArtifact {
	public constructor(
		public readonly reference: ArtifactReference,
		public readonly content: ArtifactContent,
	) {}

	public readJsonOrFail(): unknown {
		try {
			return JSON.parse(this.content.text);
		} catch {
			throw new ArtifactNotExplorableError(this.reference.id.value, this.reference.mediaType, "JSON");
		}
	}
}

export class ArtifactLoader {
	public constructor(private readonly storage: ArtifactStorage) {}

	public async loadOrFail(context: SessionContext, artifactId: string): Promise<LoadedArtifact> {
		const id = ArtifactId.from(artifactId);
		const reference = await this.storage.find(context, id);
		if (reference === undefined) throw new ArtifactNotFoundError(id.value, context.sessionId.value);
		return new LoadedArtifact(reference, await this.storage.read(context, reference));
	}
}
