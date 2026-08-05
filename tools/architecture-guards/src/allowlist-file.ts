import { readFileSync, writeFileSync } from "node:fs";
import { Allowlist } from "./allowlist";
import { AllowlistBudget } from "./allowlist-budget";
import { AllowlistEntry } from "./allowlist-entry";
import { InvalidAllowlistEntryError } from "./errors/invalid-allowlist-entry.error";
import { GuardBaseline } from "./guard-baseline";

/** Reads and writes the baseline file, validating every field it finds. */
export class AllowlistFile {
	public constructor(private readonly absolutePath: string) {}

	public load(): GuardBaseline {
		const parsed: unknown = JSON.parse(readFileSync(this.absolutePath, "utf8"));
		if (!AllowlistFile.isRecord(parsed)) throw new InvalidAllowlistEntryError("<file>", "root must be an object.");

		const entries = AllowlistFile.readEntries(parsed.entries);
		const budget = AllowlistFile.readBudget(parsed.budget);
		return new GuardBaseline(Allowlist.of(entries), budget);
	}

	public save(baseline: GuardBaseline): void {
		const budget: Record<string, number> = {};
		for (const [rule, count] of baseline.allowlist.countByRule()) budget[rule] = count;
		const content = {
			budget,
			entries: baseline.allowlist.entries.map((entry) => ({
				path: entry.path,
				rule: entry.rule,
				reason: entry.reason,
			})),
		};
		writeFileSync(this.absolutePath, `${JSON.stringify(content, undefined, "\t")}\n`, "utf8");
	}

	private static readEntries(value: unknown): AllowlistEntry[] {
		if (!Array.isArray(value)) throw new InvalidAllowlistEntryError("<file>", "entries must be an array.");
		return value.map((item, position) => {
			const key = `entries[${position}]`;
			if (!AllowlistFile.isRecord(item)) throw new InvalidAllowlistEntryError(key, "entry must be an object.");
			return AllowlistEntry.of(
				AllowlistFile.readText(item.path, key, "path"),
				AllowlistFile.readText(item.rule, key, "rule"),
				AllowlistFile.readText(item.reason, key, "reason"),
			);
		});
	}

	private static readBudget(value: unknown): AllowlistBudget {
		if (!AllowlistFile.isRecord(value)) throw new InvalidAllowlistEntryError("<file>", "budget must be an object.");
		const recorded: Record<string, number> = {};
		for (const [rule, count] of Object.entries(value)) {
			if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
				throw new InvalidAllowlistEntryError(`budget.${rule}`, "budget must be a non-negative integer.");
			}
			recorded[rule] = count;
		}
		return AllowlistBudget.of(recorded);
	}

	private static readText(value: unknown, key: string, field: string): string {
		if (typeof value !== "string") throw new InvalidAllowlistEntryError(key, `${field} must be a string.`);
		return value;
	}

	private static isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === "object" && value !== null && !Array.isArray(value);
	}
}
