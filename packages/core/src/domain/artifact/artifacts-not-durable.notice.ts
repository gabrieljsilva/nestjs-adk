/**
 * Results are moved out of the context into a store only this process can read, so a restart or
 * a second process leaves the conversation naming artifacts nothing can resolve.
 *
 * Reported through `ContextNoticeSink` at startup. It is a notice and not a refusal: the fix is
 * a durable `ArtifactStorage` or an offload policy that is turned off.
 */
export class ArtifactsNotDurable {
	public constructor(
		public readonly storage: string,
		public readonly thresholdCharacters?: number,
	) {}

	public get message(): string {
		const threshold =
			this.thresholdCharacters === undefined
				? "results are moved out of the context"
				: `results over ${this.thresholdCharacters} characters are moved out of the context`;
		return `${threshold} into ${this.storage}, which only this process can read: a restart or a second process leaves the conversation naming artifacts nothing can resolve. Compose a durable ArtifactStorage, such as SqliteArtifactStorage, or disable offloading.`;
	}
}
