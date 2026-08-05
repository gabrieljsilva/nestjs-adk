import type { GuardBaseline } from "./guard-baseline";
import type { ArchitectureRule } from "./rules/architecture-rule";
import { ExternalImportRule } from "./rules/external-import-rule";
import { ForbiddenSyntaxRule } from "./rules/forbidden-syntax-rule";
import { LayerDependencyRule } from "./rules/layer-dependency-rule";
import { PairedSpecRule } from "./rules/paired-spec-rule";
import { SingleClassExportRule } from "./rules/single-class-export-rule";
import type { SourceIndex } from "./source-index";
import type { Violation } from "./violation";

/** Runs every rule over every scanned file and reports what the baseline does not excuse. */
export class ArchitectureGuard {
	public constructor(
		private readonly rules: readonly ArchitectureRule[],
		private readonly baseline: GuardBaseline,
	) {}

	public static withDefaultRules(baseline: GuardBaseline): ArchitectureGuard {
		return new ArchitectureGuard(
			[
				new ExternalImportRule(),
				new LayerDependencyRule(),
				new SingleClassExportRule(),
				new PairedSpecRule(),
				new ForbiddenSyntaxRule(),
			],
			baseline,
		);
	}

	/** Violations that remain after the allowlist, which is what the gate fails on. */
	public run(index: SourceIndex): Violation[] {
		this.baseline.allowlist.assertPathsExist(index);
		this.baseline.budget.assertMatches(this.baseline.allowlist);
		return this.inspect(index).filter((violation) => !this.baseline.allowlist.allows(violation));
	}

	/** Every violation, allowlisted or not, which is what regenerates the baseline. */
	public inspect(index: SourceIndex): Violation[] {
		const found: Violation[] = [];
		for (const file of index.files) {
			for (const rule of this.rules) found.push(...rule.check(file, index));
		}
		return found;
	}
}
