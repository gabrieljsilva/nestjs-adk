import type { SourceFile } from "../source-file";
import type { SourceIndex } from "../source-index";
import { Violation } from "../violation";
import { ArchitectureRule } from "./architecture-rule";

const UNPAIRED_FILENAMES = new Set(["index.ts", "main.ts"]);

/** Every production file answers to a spec sitting next to it. */
export class PairedSpecRule extends ArchitectureRule {
	public readonly name = "paired-spec";

	public check(file: SourceFile, index: SourceIndex): Violation[] {
		if (!file.path.isProduction) return [];
		if (file.path.isFixture) return [];
		if (this.isBarrel(file.path.value)) return [];
		if (index.has(file.path.expectedSpec)) return [];

		return [new Violation(file.path, this.name, 1, `missing paired spec at ${file.path.expectedSpec}.`)];
	}

	private isBarrel(path: string): boolean {
		const filename = path.split("/").at(-1) ?? "";
		return UNPAIRED_FILENAMES.has(filename);
	}
}
