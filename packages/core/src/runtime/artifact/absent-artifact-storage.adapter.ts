import { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";

export class AbsentArtifactStorage extends ArtifactStorage {
	public constructor(private readonly reason: string) {
		super();
	}

	public async put(): Promise<ArtifactReference> {
		throw new Error(this.reason);
	}

	public async read(): Promise<ArtifactContent> {
		throw new Error(this.reason);
	}

	public async update(): Promise<ArtifactReference> {
		throw new Error(this.reason);
	}

	public async find(): Promise<ArtifactReference | undefined> {
		return undefined;
	}

	public async list(): Promise<readonly ArtifactReference[]> {
		return [];
	}

	public async deleteAll(): Promise<void> {
		return undefined;
	}
}
