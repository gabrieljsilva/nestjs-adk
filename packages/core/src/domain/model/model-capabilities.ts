import type { ModelCapability } from "./model-capability";

/**
 * What a model declares it can do.
 * Not declaring a capability is different from declaring it unsupported: the first
 * means the adapter never spoke about it, and callers that need certainty check
 * `declares` before trusting `supports`.
 */
export class ModelCapabilities {
	private readonly declared: ReadonlyMap<string, boolean>;

	private constructor(declared: ReadonlyMap<string, boolean>) {
		this.declared = declared;
	}

	public static none(): ModelCapabilities {
		return new ModelCapabilities(new Map());
	}

	public static of(entries: ReadonlyArray<readonly [ModelCapability, boolean]>): ModelCapabilities {
		return new ModelCapabilities(new Map(entries.map(([capability, supported]) => [capability.name, supported])));
	}

	public declares(capability: ModelCapability): boolean {
		return this.declared.has(capability.name);
	}

	public supports(capability: ModelCapability): boolean {
		return this.declared.get(capability.name) === true;
	}
}
