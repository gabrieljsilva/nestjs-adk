import type { AgentName } from "./agent-name.value-object";

/**
 * Which agents this one may hand a single task to while keeping the conversation.
 * The list is closed: the model is offered exactly these, and a target nobody declared is refused.
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
