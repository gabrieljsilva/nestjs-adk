import { InvalidMetadataValueError } from "../errors/invalid-metadata-value.error";
import { MetadataValueTooLargeError } from "../errors/metadata-value-too-large.error";
import type { MetadataKey } from "./metadata-key.value-object";
import type { MetadataValue } from "./metadata-value.value-object";

/**
 * How large one value may serialize to, in bytes of UTF-8 JSON.
 *
 * Sixteen kibibytes is generous for what metadata is for, an identifier, a locale, a tenant,
 * a flag, and small enough that a session carrying a handful of them stays a thing the
 * runtime reads on every commit rather than a payload it moves. The limit is per key and not
 * per session on purpose: a session with forty small keys is somebody using the feature,
 * while one key the size of a document is somebody using the wrong feature.
 */
const MAX_VALUE_BYTES = 16 * 1024;

/** Deeper than this is a value that lost its shape, and it is refused rather than walked. */
const MAX_DEPTH = 16;

/**
 * What an application knows about a session that the conversation does not say.
 *
 * It is durable and it is a projection: every entry here is the fold of the metadata events
 * in the journal, so it survives a restart, means the same in any process, and cannot be
 * changed behind a run. Last write per key wins, which is what makes replaying the journal
 * and reading the snapshot land on the same map.
 *
 * Values are JSON and nothing else. What crosses this boundary is written to a row and read
 * back by whoever holds it, possibly another build, so a value that does not survive the
 * round trip unchanged is refused where it is written rather than where it is read.
 */
export class SessionMetadata {
	private constructor(private readonly values: ReadonlyMap<string, MetadataValue>) {}

	public static empty(): SessionMetadata {
		return new SessionMetadata(new Map());
	}

	/** The form an application writes inline, which is the only place plain objects enter. */
	public static fromRecord(record: Readonly<Record<string, MetadataValue>>): SessionMetadata {
		return SessionMetadata.fromEntries(Object.entries(record));
	}

	public static fromEntries(entries: ReadonlyArray<readonly [string, MetadataValue]>): SessionMetadata {
		return entries.reduce<SessionMetadata>((carried, [key, value]) => carried.with(key, value), SessionMetadata.empty());
	}

	public with<T extends MetadataValue>(key: MetadataKey<T> | string, value: T): SessionMetadata {
		const name = SessionMetadata.readName(key);
		SessionMetadata.verify(name, value);
		const next = new Map(this.values);
		next.set(name, value);
		return new SessionMetadata(next);
	}

	public without(key: MetadataKey | string): SessionMetadata {
		const next = new Map(this.values);
		next.delete(SessionMetadata.readName(key));
		return new SessionMetadata(next);
	}

	/** The value this key promised, or nothing when it was never written or came back as something else. */
	public find<T extends MetadataValue>(key: MetadataKey<T>): T | undefined {
		const value = this.values.get(key.name);
		if (value === undefined) return undefined;
		return key.accepts(value) ? value : undefined;
	}

	public has(key: MetadataKey | string): boolean {
		return this.values.has(SessionMetadata.readName(key));
	}

	public get size(): number {
		return this.values.size;
	}

	public get isEmpty(): boolean {
		return this.values.size === 0;
	}

	/** Entries sorted by key, which is what makes the canonical serialization stable. */
	public entries(): ReadonlyArray<readonly [string, MetadataValue]> {
		return [...this.values.entries()].sort((left, right) => left[0].localeCompare(right[0]));
	}

	private static readName(key: MetadataKey | string): string {
		return typeof key === "string" ? key : key.name;
	}

	/**
	 * Refuses anything a row cannot hold, and anything too large to ride on every commit.
	 *
	 * The serialization is done here rather than trusted to the codec because it is also the
	 * measurement: whatever `JSON.stringify` answers is exactly what a storage writes, so the
	 * limit is about the bytes that actually land instead of about the shape they came from.
	 */
	private static verify(key: string, value: MetadataValue): void {
		const reason = SessionMetadata.reasonAgainst(value, 0);
		if (reason !== undefined) throw new InvalidMetadataValueError(key, reason);
		const bytes = new TextEncoder().encode(JSON.stringify(value) ?? "null").length;
		if (bytes > MAX_VALUE_BYTES) throw new MetadataValueTooLargeError(key, bytes, MAX_VALUE_BYTES);
	}

	/** Narrows what a row or a payload handed back, which is the only place a value arrives untyped. */
	public static isValue(value: unknown): value is MetadataValue {
		return SessionMetadata.reasonAgainst(value, 0) === undefined;
	}

	/** Why this value cannot be metadata, or nothing when it can. */
	private static reasonAgainst(value: unknown, depth: number): string | undefined {
		if (depth > MAX_DEPTH) return `nested deeper than ${MAX_DEPTH} levels.`;
		if (value === null || typeof value === "string" || typeof value === "boolean") return undefined;
		if (typeof value === "number") {
			return Number.isFinite(value) ? undefined : `${value} is not a finite number.`;
		}
		if (Array.isArray(value)) return SessionMetadata.firstReason(value, depth);
		if (SessionMetadata.isPlainObject(value)) return SessionMetadata.firstReason(Object.values(value), depth);
		return `${SessionMetadata.describe(value)} is not a JSON value.`;
	}

	private static firstReason(values: readonly unknown[], depth: number): string | undefined {
		for (const held of values) {
			const reason = SessionMetadata.reasonAgainst(held, depth + 1);
			if (reason !== undefined) return reason;
		}
		return undefined;
	}

	private static isPlainObject(value: unknown): value is Record<string, unknown> {
		if (typeof value !== "object" || value === null) return false;
		const prototype = Object.getPrototypeOf(value);
		return prototype === Object.prototype || prototype === null;
	}

	private static describe(value: unknown): string {
		if (typeof value === "object" && value !== null) return value.constructor?.name ?? "an object";
		return typeof value;
	}

	public static get maxValueBytes(): number {
		return MAX_VALUE_BYTES;
	}
}
