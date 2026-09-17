import type { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import { TransferNotDeclaredError } from "../../domain/agent/errors/transfer-not-declared.error";
import type { AgentCatalog } from "../catalog/agent-catalog.service";
import { Handover } from "./handover.value-object";

export class TransferGate {
	public constructor(private readonly catalog: AgentCatalog) {}

	public allowsFrom(from: AgentDefinition, to: AgentName): boolean {
		return from.transfer.allows(to);
	}

	public open(from: AgentDefinition, to: AgentName): AgentDefinition {
		if (!this.allowsFrom(from, to)) {
			throw new TransferNotDeclaredError(from.name.value, to.value, from.transfer.names);
		}
		return this.catalog.findOrFail(to);
	}

	public resolve(entry: AgentDefinition, to?: AgentName): Handover {
		if (to === undefined) return new Handover(entry);
		return new Handover(this.open(entry, to), entry.name);
	}
}
