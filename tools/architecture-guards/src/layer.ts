const CORE_PREFIX = "packages/core/src/";

/**
 * One of the target layers of the core, or `legacy` for anything that still lives
 * outside them. Layer rules only constrain known layers, so migrated code is guarded
 * from the first commit while the old tree is described by the allowlist.
 */
export class Layer {
	public static readonly PUBLIC = new Layer("public");
	public static readonly CONTRACTS = new Layer("contracts");
	public static readonly DOMAIN = new Layer("domain");
	public static readonly RUNTIME = new Layer("runtime");
	public static readonly ADAPTERS = new Layer("adapters");
	public static readonly COMMON = new Layer("common");
	public static readonly SUPPORT = new Layer("support");
	public static readonly LEGACY = new Layer("legacy");

	private constructor(public readonly name: string) {}

	public static of(relativePath: string): Layer {
		if (!relativePath.startsWith(CORE_PREFIX)) return Layer.LEGACY;
		const head = relativePath.slice(CORE_PREFIX.length).split("/")[0] ?? "";
		switch (head) {
			case "public":
				return Layer.PUBLIC;
			case "contracts":
				return Layer.CONTRACTS;
			case "domain":
				return Layer.DOMAIN;
			case "runtime":
				return Layer.RUNTIME;
			case "adapters":
				return Layer.ADAPTERS;
			case "common":
				return Layer.COMMON;
			case "support":
				return Layer.SUPPORT;
			default:
				return Layer.LEGACY;
		}
	}

	public get isKnown(): boolean {
		return !this.equals(Layer.LEGACY);
	}

	/** Direction of the dependency arrows in the architecture reference. */
	public canDependOn(other: Layer): boolean {
		if (this.equals(other)) return true;
		if (other.equals(Layer.COMMON)) return true;
		switch (this.name) {
			case "public":
				return other.equals(Layer.RUNTIME) || other.equals(Layer.DOMAIN) || other.equals(Layer.CONTRACTS);
			case "runtime":
				return other.equals(Layer.DOMAIN) || other.equals(Layer.CONTRACTS);
			case "adapters":
				return other.equals(Layer.CONTRACTS) || other.equals(Layer.DOMAIN);
			case "contracts":
				return other.equals(Layer.DOMAIN);
			case "domain":
			case "common":
				return false;
			default:
				return true;
		}
	}

	public equals(other: Layer): boolean {
		return this.name === other.name;
	}

	public toString(): string {
		return this.name;
	}
}
