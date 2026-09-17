/**
 * The runtime was composed to move results out of the context and into a store that only
 * this process can read.
 *
 * Everything still works while one process is running, which is why this is a notice and
 * not a refusal: a first script, a test and a single container are all correct under it.
 * What it costs is everything the moment there is a second process or a restart. The
 * conversation keeps the placeholder, because the journal is durable, and the artifact it
 * names is gone, so `read_artifact` and the exploration tools answer that an id nobody can
 * resolve does not exist. The model is then looking at a sentence describing content it
 * has no way to reach.
 *
 * The fix is one line, and it is either a durable `ArtifactStorage` (`SqliteArtifactStorage`
 * or one of your own) or an offload policy that is turned off, which keeps large results in
 * the prompt and pays for them there.
 */
export class ArtifactsNotDurable {
	public constructor(
		/** The class name of the storage that was composed, so the notice names what to replace. */
		public readonly storage: string,
		/** The size a result passes to be moved out, when the policy decides on one. */
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
