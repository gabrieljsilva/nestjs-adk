import type { SourceFile } from "../source-file";
import type { SourceIndex } from "../source-index";
import { Violation } from "../violation";
import { ArchitectureRule } from "./architecture-rule";

/** One production class per file, so a file name always names the thing inside it. */
export class SingleClassExportRule extends ArchitectureRule {
	public readonly name = "single-class-export";

	public check(file: SourceFile, _index: SourceIndex): Violation[] {
		if (!file.path.isProduction) return [];

		const exported = file.exportedClasses();
		if (exported.length <= 1) return [];

		const names = exported.map((symbol) => symbol.name).join(", ");
		const second = exported[1];
		if (second === undefined) return [];
		return [
			new Violation(
				file.path,
				this.name,
				second.line,
				`file exports ${exported.length} classes (${names}); split them one per file.`,
			),
		];
	}
}
