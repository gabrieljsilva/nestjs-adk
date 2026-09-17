import { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";

/**
 * Storage that holds nothing, which is the honest shape of having none.
 *
 * Reading and writing fail with the message the caller gave it, because a composition
 * assembled without artifacts and a projection built outside a runtime are the same absence
 * arrived at two ways, and the reader of the failure needs to know which one. Looking
 * something up answers nothing rather than failing: nothing was ever stored, and that is an
 * answer.
 */
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

	public async find(): Promise<ArtifactReference | undefined> {
		return undefined;
	}

	public async deleteAll(): Promise<void> {
		return undefined;
	}
}
