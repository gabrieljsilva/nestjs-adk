import type { ArtifactPart, ArtifactRef } from "../types/events";

/**
 * Contract for versioned artifacts — the basis for tool-result offloading.
 * Bridges to the ADK's BaseArtifactService in the adapter.
 */
export abstract class ArtifactStore {
	/** Returns the saved version (0, 1, 2...). */
	public abstract save(ref: ArtifactRef, part: ArtifactPart): Promise<number>;
	/** Without `version` → the most recent. */
	public abstract load(ref: ArtifactRef, version?: number): Promise<ArtifactPart | null>;
	public abstract listKeys(scope: { sessionId: string }): Promise<string[]>;
	public abstract listVersions(ref: ArtifactRef): Promise<number[]>;
	public abstract delete(ref: ArtifactRef): Promise<void>;
}
