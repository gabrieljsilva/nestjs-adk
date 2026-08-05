import { InvalidAllowlistEntryError } from "./errors/invalid-allowlist-entry.error";

const WILDCARD_CHARACTERS = ["*", "?", "{", "}", "[", "]"];

/**
 * One documented exception: an exact file, an exact rule, and why it is still there.
 * Wildcards are rejected, because a pattern silently absorbs new violations.
 */
export class AllowlistEntry {
	private constructor(
		public readonly path: string,
		public readonly rule: string,
		public readonly reason: string,
	) {}

	public static of(path: string, rule: string, reason: string): AllowlistEntry {
		const key = `${path} [${rule}]`;
		if (path.trim().length === 0) throw new InvalidAllowlistEntryError(key, "path is empty.");
		if (rule.trim().length === 0) throw new InvalidAllowlistEntryError(key, "rule is empty.");
		if (WILDCARD_CHARACTERS.some((character) => path.includes(character))) {
			throw new InvalidAllowlistEntryError(key, "path uses a wildcard; list the exact file.");
		}
		if (reason.trim().length === 0) throw new InvalidAllowlistEntryError(key, "reason is empty.");
		return new AllowlistEntry(path, rule, reason);
	}

	public get key(): string {
		return `${this.path}::${this.rule}`;
	}
}
