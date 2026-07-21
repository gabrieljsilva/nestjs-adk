import { Injectable } from "@nestjs/common";
import { ArtifactStore } from "../abstracts/artifact-store";
import type { ArtifactPart, ArtifactRef } from "../types/events";

@Injectable()
export class InMemoryArtifactStore extends ArtifactStore {
	/** sessionId → name → versions. */
	private readonly artifacts = new Map<string, Map<string, ArtifactPart[]>>();

	public async save(ref: ArtifactRef, part: ArtifactPart): Promise<number> {
		let session = this.artifacts.get(ref.sessionId);
		if (!session) {
			session = new Map();
			this.artifacts.set(ref.sessionId, session);
		}
		let versions = session.get(ref.name);
		if (!versions) {
			versions = [];
			session.set(ref.name, versions);
		}
		versions.push(structuredClone(part));
		return versions.length - 1;
	}

	public async load(ref: ArtifactRef, version?: number): Promise<ArtifactPart | null> {
		const versions = this.artifacts.get(ref.sessionId)?.get(ref.name);
		if (!versions?.length) return null;
		const part = versions[version ?? versions.length - 1];
		return part ? structuredClone(part) : null;
	}

	public async listKeys(scope: { sessionId: string }): Promise<string[]> {
		return [...(this.artifacts.get(scope.sessionId)?.keys() ?? [])];
	}

	public async listVersions(ref: ArtifactRef): Promise<number[]> {
		const versions = this.artifacts.get(ref.sessionId)?.get(ref.name) ?? [];
		return versions.map((_, index) => index);
	}

	public async delete(ref: ArtifactRef): Promise<void> {
		this.artifacts.get(ref.sessionId)?.delete(ref.name);
	}
}
