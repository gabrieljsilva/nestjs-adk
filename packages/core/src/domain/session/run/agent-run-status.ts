/** Where a single command execution stands. */
export class AgentRunStatus {
	public static readonly RUNNING = new AgentRunStatus("running");
	public static readonly SUSPENDED = new AgentRunStatus("suspended");
	public static readonly COMPLETED = new AgentRunStatus("completed");
	public static readonly FAILED = new AgentRunStatus("failed");
	public static readonly CANCELLED = new AgentRunStatus("cancelled");

	private constructor(public readonly name: string) {}

	public get isTerminal(): boolean {
		return this === AgentRunStatus.COMPLETED || this === AgentRunStatus.FAILED || this === AgentRunStatus.CANCELLED;
	}

	public equals(other: AgentRunStatus): boolean {
		return this.name === other.name;
	}

	public toString(): string {
		return this.name;
	}
}
