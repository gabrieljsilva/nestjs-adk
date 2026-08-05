import type { AgentName } from "./agent-name";

/**
 * Which agents this one may hand a task to without giving up the conversation.
 *
 * Delegation and transfer look alike and mean opposite things. A transfer says somebody
 * else owns the session from here on; a delegation says "answer this one question for me"
 * and the asking agent keeps the conversation, reads the answer and carries on.
 *
 * The edges are declared for the same reason transfer's are: an agent that could hand
 * work to anything has no boundary, and the model is offered exactly this list.
 */
export class AgentDelegationPolicy {
	private constructor(public readonly targets: readonly AgentName[]) {}

	public static none(): AgentDelegationPolicy {
		return new AgentDelegationPolicy([]);
	}

	public static to(targets: readonly AgentName[]): AgentDelegationPolicy {
		return new AgentDelegationPolicy([...targets]);
	}

	public get isEmpty(): boolean {
		return this.targets.length === 0;
	}

	public get names(): readonly string[] {
		return this.targets.map((target) => target.value);
	}

	public allows(target: AgentName): boolean {
		return this.targets.some((declared) => declared.equals(target));
	}

	public describe(): string {
		return this.isEmpty ? "none" : this.names.join(", ");
	}
}
