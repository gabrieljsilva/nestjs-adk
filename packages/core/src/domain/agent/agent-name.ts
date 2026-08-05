import { MissingAgentNameError } from "./errors/missing-agent-name.error";

const SEPARATORS = /[\s_-]+/g;

/**
 * Unique name of an agent, compared after normalization.
 * Trim, lowercase and separator collapse mean `Support Agent`, `support-agent` and
 * `support__agent` all denote the same agent, so a catalog cannot hold two of them.
 */
export class AgentName {
	private readonly normalized: string;

	private constructor(
		public readonly declared: string,
		normalized: string,
	) {
		this.normalized = normalized;
	}

	public static from(value: string): AgentName {
		const normalized = value.trim().toLowerCase().replace(SEPARATORS, "-");
		if (normalized.length === 0) throw new MissingAgentNameError(value);
		return new AgentName(value, normalized);
	}

	public get value(): string {
		return this.normalized;
	}

	public equals(other: AgentName): boolean {
		return this.normalized === other.normalized;
	}

	public toString(): string {
		return this.normalized;
	}
}
