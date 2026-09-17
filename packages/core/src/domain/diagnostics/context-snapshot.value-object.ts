import type { AgentName } from "../agent/agent-name.value-object";
import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import { ContextSegment } from "./context-segment.value-object";

/**
 * Exactly what one model call was given. Nothing here is derived, rounded or summarized.
 */
export class ContextSnapshot {
	public constructor(
		public readonly agent: AgentName,
		public readonly model: ModelIdentity,
		public readonly segments: readonly ContextSegment[],
	) {}

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
