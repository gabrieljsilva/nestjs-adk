import type { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import { TransferNotDeclaredError } from "../../domain/agent/errors/transfer-not-declared.error";
import type { AgentCatalog } from "../catalog/agent-catalog.service";
import { Handover } from "./handover.value-object";

/**
 * The one place that decides whether a handover is allowed to happen.
 *
 * Both ways into a transfer go through here: the model calling the tool, and the
 * application asking a different agent to take a session it does not currently hold. A
 * check that lived in only one of them would be a boundary with a door around the side.
 *
 * It answers before anything is written. An agent that was never declared as a target
 * leaves no trace at all, because a refused handover is not something that happened to
 * the conversation.
 */
export class TransferGate {
	public constructor(private readonly catalog: AgentCatalog) {}

	public allowsFrom(from: AgentDefinition, to: AgentName): boolean {
		return from.transfer.allows(to);
	}

	/** The agent that receives the session, or a typed refusal naming what was declared. */
	public open(from: AgentDefinition, to: AgentName): AgentDefinition {
		if (!this.allowsFrom(from, to)) {
			throw new TransferNotDeclaredError(from.name.value, to.value, from.transfer.names);
		}
		return this.catalog.findOrFail(to);
	}

	/**
	 * Who answers a command, for a command that may be handing the session over first.
	 *
	 * A command naming no target is not a transfer, and answers with the agent it entered
	 * with. One that names a target goes through the same check as the model's, before the
	 * session is touched, so a handover nobody declared leaves no trace at all.
	 */
	public resolve(entry: AgentDefinition, to?: AgentName): Handover {
		if (to === undefined) return new Handover(entry);
		return new Handover(this.open(entry, to), entry.name);
	}
}
