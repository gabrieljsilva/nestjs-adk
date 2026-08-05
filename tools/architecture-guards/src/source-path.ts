import { Layer } from "./layer";

const SPEC_SUFFIX = ".spec.ts";
const FIXTURE_SUFFIX = ".fixture.ts";
const DECLARATION_SUFFIX = ".d.ts";

/** Repository relative path of a scanned file, aware of what kind of file it is. */
export class SourcePath {
	private constructor(public readonly value: string) {}

	public static of(value: string): SourcePath {
		return new SourcePath(value.split("\\").join("/"));
	}

	public get layer(): Layer {
		return Layer.of(this.value);
	}

	public get isSpec(): boolean {
		return this.value.endsWith(SPEC_SUFFIX);
	}

	public get isFixture(): boolean {
		return this.value.endsWith(FIXTURE_SUFFIX);
	}

	public get isDeclaration(): boolean {
		return this.value.endsWith(DECLARATION_SUFFIX);
	}

	/** A file that ships behavior, and therefore answers to every rule. */
	public get isProduction(): boolean {
		return !this.isSpec && !this.isDeclaration;
	}

	/** Where the paired spec of this file must live. */
	public get expectedSpec(): string {
		return `${this.value.slice(0, -".ts".length)}${SPEC_SUFFIX}`;
	}

	public toString(): string {
		return this.value;
	}
}
