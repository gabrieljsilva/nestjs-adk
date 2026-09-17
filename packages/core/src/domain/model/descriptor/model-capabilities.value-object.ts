import type { ModelCapability } from "./model-capability.value-object";

/**
 * What a model declares it can do.
 * Never declaring a capability differs from declaring it unsupported, so a caller that
 * needs certainty asks `declares` before trusting `supports`.
 */
export class ModelCapabilities {
	private readonly declared: ReadonlyMap<string, boolean>;

	private constructor(declared: ReadonlyMap<string, boolean>) {
		this.declared = declared;
	}

	public static none(): ModelCapabilities {
		return new ModelCapabilities(new Map());
	}

	public static fromEntries(entries: ReadonlyArray<readonly [ModelCapability, boolean]>): ModelCapabilities {
		return new ModelCapabilities(new Map(entries.map(([capability, supported]) => [capability.name, supported])));
	}

	public declares(capability: ModelCapability): boolean {
		return this.declared.has(capability.name);
	}

	public supports(capability: ModelCapability): boolean {
		return this.declared.get(capability.name) === true;
	}
}
