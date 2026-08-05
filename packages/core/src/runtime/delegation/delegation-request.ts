/**
 * What one delegation call asked for, once it has been read out of loose arguments.
 *
 * The task is a string rather than the conversation because the child does not read this
 * conversation: whatever it needs to know has to be in these words.
 */
export class DelegationRequest {
	public constructor(
		public readonly agentName: string,
		public readonly task: string,
	) {}
}
