import { AllowlistEntry } from "./allowlist-entry";
import { InvalidAllowlistEntryError } from "./errors/invalid-allowlist-entry.error";
import type { SourceIndex } from "./source-index";
import type { Violation } from "./violation";

/** Every violation the repository still carries, named one by one. */
export class Allowlist {
	private readonly keys: ReadonlySet<string>;

	private constructor(public readonly entries: readonly AllowlistEntry[]) {
		this.keys = new Set(entries.map((entry) => entry.key));
	}

	public static of(entries: readonly AllowlistEntry[]): Allowlist {
		const seen = new Set<string>();
		for (const entry of entries) {
			if (seen.has(entry.key)) {
				throw new InvalidAllowlistEntryError(entry.key, "entry is duplicated.");
			}
			seen.add(entry.key);
		}
		return new Allowlist(entries);
	}

	public static empty(): Allowlist {
		return new Allowlist([]);
	}

	/** Entries pointing at files that no longer exist are stale and must be deleted. */
	public assertPathsExist(index: SourceIndex): void {
		for (const entry of this.entries) {
			if (index.has(entry.path)) continue;
			throw new InvalidAllowlistEntryError(entry.key, "path does not exist in the scanned sources.");
		}
	}

	public allows(violation: Violation): boolean {
		return this.keys.has(`${violation.path.value}::${violation.rule}`);
	}

	public countByRule(): ReadonlyMap<string, number> {
		const counts = new Map<string, number>();
		for (const entry of this.entries) {
			counts.set(entry.rule, (counts.get(entry.rule) ?? 0) + 1);
		}
		return counts;
	}
}
