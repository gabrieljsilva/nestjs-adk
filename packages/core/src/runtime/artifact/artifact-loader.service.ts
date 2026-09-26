import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { ArtifactRefusal } from "./artifact-refusal.value-object";
import { ArtifactNotExplorableError } from "./errors/artifact-not-explorable.error";

const NO_CEILING = Number.POSITIVE_INFINITY;

export class LoadedArtifact {
	public constructor(
		public readonly reference: ArtifactReference,
		public readonly content: ArtifactContent,
	) {}

	public get isText(): boolean {
		return this.content.isText;
	}

	public readJsonOrFail(): unknown {
		try {
			return JSON.parse(this.content.text);
		} catch {
			throw new ArtifactNotExplorableError(this.reference.id.value, this.reference.mediaType, "JSON");
		}
	}
}

export class LoadedRange {
	public constructor(
		public readonly reference: ArtifactReference,
		public readonly text: string,
		public readonly offset: number,
	) {}
}

export class ArtifactLoader {
	public constructor(
		private readonly storage: ArtifactStorage,
		private readonly maxExplorableCharacters: number = NO_CEILING,
	) {}

	public async loadOrFail(context: SessionContext, artifactId: string): Promise<LoadedArtifact> {
		const reference = await this.findOrFail(context, artifactId);
		return new LoadedArtifact(reference, await this.storage.read(context, reference));
	}

	public async loadOrRefuse(context: SessionContext, artifactId: string): Promise<LoadedArtifact | ArtifactRefusal> {
		const reference = await this.findOrFail(context, artifactId);
		if (!reference.isText) return ArtifactRefusal.forBytes(reference);
		if (reference.characters > this.maxExplorableCharacters) {
			return ArtifactRefusal.forSize(reference, this.maxExplorableCharacters);
		}
		return new LoadedArtifact(reference, await this.storage.read(context, reference));
	}

	public async loadRangeOrRefuse(
		context: SessionContext,
		artifactId: string,
		offset: number,
		length: number,
	): Promise<LoadedRange | ArtifactRefusal> {
		const reference = await this.findOrFail(context, artifactId);
		if (!reference.isText) return ArtifactRefusal.forBytes(reference);
		const start = Math.min(Math.max(0, Math.trunc(offset)), reference.characters);
		const text = await this.storage.readRange(context, reference, start, Math.max(0, Math.trunc(length)));
		return new LoadedRange(reference, text, start);
	}

	private async findOrFail(context: SessionContext, artifactId: string): Promise<ArtifactReference> {
		const id = ArtifactId.from(artifactId);
		const reference = await this.storage.find(context, id);
		if (reference === undefined) throw new ArtifactNotFoundError(id.value, context.sessionId.value);
		return reference;
	}
}
