import type { AgentName } from "./agent-name";

/**
 * Which agents this one may hand the session to.
 *
 * The edges are declared, directed and closed: an agent transfers only to what it named,
 * and naming nobody means it never transfers. There is no implicit edge back to whoever
 * transferred here, because the way back is a decision the receiving agent has to have
 * made on purpose.
 *
 * The list is what the model is shown and what the runtime checks against, so a target
 * that was never declared cannot be reached by asking for it nicely.
 */
export class AgentTransferPolicy {
	private constructor(public readonly targets: readonly AgentName[]) {}

	public static none(): AgentTransferPolicy {
		return new AgentTransferPolicy([]);
	}

	public static to(targets: readonly AgentName[]): AgentTransferPolicy {
		return new AgentTransferPolicy([...targets]);
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
