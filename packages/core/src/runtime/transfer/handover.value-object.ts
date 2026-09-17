import type { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import type { AgentName } from "../../domain/agent/agent-name.value-object";

/**
 * Who answers a run, and who handed the session to them.
 *
 * `from` is absent when nothing was handed over, which is what tells the journal apart: a
 * run that transferred records where the session came from, and an ordinary run has
 * nowhere to name.
 */
export class Handover {
	public constructor(
		public readonly definition: AgentDefinition,
		public readonly from?: AgentName,
	) {}
}
