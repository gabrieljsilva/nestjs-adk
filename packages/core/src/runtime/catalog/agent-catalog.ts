import type { AgentDefinition } from "../../domain/agent/agent-definition";
import type { AgentName } from "../../domain/agent/agent-name";
import type { DeclaredAgent } from "../../domain/agent/declared-agent";
import { AgentNotInCatalogError } from "./errors/agent-not-in-catalog.error";
import { UnknownDelegationTargetError } from "./errors/unknown-delegation-target.error";
import { UnknownTransferTargetError } from "./errors/unknown-transfer-target.error";

/**
 * Every agent the application declared, resolved once at boot and read only after.
 * There is no add, replace or remove: a catalog that could change under a running
 * command would let two turns of the same run see different agents.
 */
export class AgentCatalog {
	private readonly byName: ReadonlyMap<string, DeclaredAgent>;

	private constructor(entries: readonly DeclaredAgent[]) {
		this.byName = new Map(entries.map((entry) => [entry.definition.name.value, entry]));
		Object.freeze(this);
	}

	public static of(entries: readonly DeclaredAgent[]): AgentCatalog {
		const catalog = new AgentCatalog(entries);
		catalog.assertEdgesResolve();
		return catalog;
	}

	public get names(): readonly string[] {
		return [...this.byName.keys()];
	}

	public get size(): number {
		return this.byName.size;
	}

	public has(name: AgentName): boolean {
		return this.byName.has(name.value);
	}

	public findOrFail(name: AgentName): AgentDefinition {
		const entry = this.byName.get(name.value);
		if (entry === undefined) throw new AgentNotInCatalogError(name.value, this.names);
		return entry.definition;
	}

	/** A declared edge that points at nothing is a boot problem, never a run time surprise. */
	private assertEdgesResolve(): void {
		for (const entry of this.byName.values()) {
			const definition = entry.definition;
			for (const target of definition.transfer.targets) {
				if (!this.has(target)) {
					throw new UnknownTransferTargetError(definition.name.value, target.value, this.names);
				}
			}
			for (const target of definition.delegation.targets) {
				if (!this.has(target)) {
					throw new UnknownDelegationTargetError(definition.name.value, target.value, this.names);
				}
			}
		}
	}
}
