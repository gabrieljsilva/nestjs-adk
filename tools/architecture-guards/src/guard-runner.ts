import { join } from "node:path";
import { Allowlist } from "./allowlist";
import { AllowlistBudget } from "./allowlist-budget";
import { AllowlistEntry } from "./allowlist-entry";
import { AllowlistFile } from "./allowlist-file";
import { ArchitectureGuard } from "./architecture-guard";
import { GuardBaseline } from "./guard-baseline";
import { ScanRoots } from "./scan-roots";
import type { SourceIndex } from "./source-index";
import { SourceReader } from "./source-reader";
import type { Violation } from "./violation";

const BASELINE_FILE = "tools/architecture-guards/allowlist.json";
const LEGACY_REASON = "pre-existing violation inherited from the tree before the native runtime refactor.";

/** Wires reader, rules and baseline into the single entry point the gate and the generator share. */
export class GuardRunner {
	public constructor(
		private readonly repositoryRoot: string,
		private readonly roots: ScanRoots = ScanRoots.default(),
	) {}

	public read(): SourceIndex {
		return new SourceReader(this.repositoryRoot).read(this.roots);
	}

	/** Violations the baseline does not excuse; an empty array is a green gate. */
	public check(): Violation[] {
		return ArchitectureGuard.withDefaultRules(this.baseline()).run(this.read());
	}

	/**
	 * Rewrites the baseline from what the tree currently violates.
	 * Files already sitting in a target layer are skipped on purpose: the allowlist
	 * describes the tree we are leaving behind, never the code being written now.
	 */
	public regenerate(): GuardBaseline {
		const found = ArchitectureGuard.withDefaultRules(
			new GuardBaseline(Allowlist.empty(), AllowlistBudget.of({})),
		).inspect(this.read());
		const entries = new Map<string, AllowlistEntry>();
		for (const violation of found) {
			if (violation.path.layer.isKnown) continue;
			const entry = AllowlistEntry.of(violation.path.value, violation.rule, LEGACY_REASON);
			entries.set(entry.key, entry);
		}
		const allowlist = Allowlist.of([...entries.values()].sort((left, right) => left.key.localeCompare(right.key)));
		const budget: Record<string, number> = {};
		for (const [rule, count] of allowlist.countByRule()) budget[rule] = count;

		const baseline = new GuardBaseline(allowlist, AllowlistBudget.of(budget));
		this.file().save(baseline);
		return baseline;
	}

	public baseline(): GuardBaseline {
		return this.file().load();
	}

	private file(): AllowlistFile {
		return new AllowlistFile(join(this.repositoryRoot, BASELINE_FILE));
	}
}
