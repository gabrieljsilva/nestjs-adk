import { MissingAgentDescriptionError } from "./errors/missing-agent-description.error";

/** What the agent is for, in the words another agent reads before reaching it. */
export class AgentDescription {
	private constructor(public readonly value: string) {}

	public static from(value: string, agentName: string): AgentDescription {
		const trimmed = value.trim();
		if (trimmed.length === 0) throw new MissingAgentDescriptionError(agentName);
		return new AgentDescription(trimmed);
	}

	public toString(): string {
		return this.value;
	}
}
