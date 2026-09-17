import type { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import type { AgentName } from "../../domain/agent/agent-name.value-object";

export class Handover {
	public constructor(
		public readonly definition: AgentDefinition,
		public readonly from?: AgentName,
	) {}
}
