import type { AgentName } from "../agent/agent-name";
import type { ModelIdentity } from "../model/model-identity";
import { ContextSegment } from "./context-segment";

/**
 * Exactly what one model call was given, kept so somebody can look at it afterwards.
 *
 * It is a photograph and not a summary: nothing here is derived, rounded or explained. The
 * questions people ask of it, how much of two runs is a shared prefix and where they first
 * differ, are answered by comparing the strings it holds.
 */
export class ContextSnapshot {
	public constructor(
		public readonly agent: AgentName,
		public readonly model: ModelIdentity,
		public readonly segments: readonly ContextSegment[],
	) {}

	/** The whole context as one string, in the order a provider receives it. */
	public get text(): string {
		return this.segments.map((segment) => segment.text).join("");
	}

	public get characters(): number {
		return this.text.length;
	}

	public segment(kind: string): ContextSegment | undefined {
		return this.segments.find((segment) => segment.kind === kind);
	}
}
