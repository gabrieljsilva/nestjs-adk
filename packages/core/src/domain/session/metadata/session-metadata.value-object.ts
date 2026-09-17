import { InvalidMetadataValueError } from "../errors/invalid-metadata-value.error";
import { MetadataValueTooLargeError } from "../errors/metadata-value-too-large.error";
import type { MetadataKey } from "./metadata-key.value-object";
import type { MetadataValue } from "./metadata-value.value-object";

const MAX_UTF8_BYTES_PER_METADATA_VALUE = 16 * 1024;
const MAX_METADATA_VALUE_DEPTH = 16;

/**
 * What an application knows about a session that the conversation does not say: the fold of the
 * metadata events in the journal, durable and last write per key.
 *
 * Values are JSON and nothing else, and a value that is not, or is over the per-key size limit,
 * is refused here rather than at the row it would be written to.
 */
export class SessionMetadata {
	private constructor(private readonly values: ReadonlyMap<string, MetadataValue>) {}

	public static empty(): SessionMetadata {
		return new SessionMetadata(new Map());
	}

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

	public entries(): ReadonlyArray<readonly [string, MetadataValue]> {
		return [...this.values.entries()].sort((left, right) => left[0].localeCompare(right[0]));
	}

	private static readName(key: MetadataKey | string): string {
		return typeof key === "string" ? key : key.name;
	}

	private static verify(key: string, value: MetadataValue): void {
		const reason = SessionMetadata.reasonAgainst(value, 0);
		if (reason !== undefined) throw new InvalidMetadataValueError(key, reason);
		const bytes = new TextEncoder().encode(JSON.stringify(value) ?? "null").length;
		if (bytes > MAX_UTF8_BYTES_PER_METADATA_VALUE)
			throw new MetadataValueTooLargeError(key, bytes, MAX_UTF8_BYTES_PER_METADATA_VALUE);
	}

	public static isValue(value: unknown): value is MetadataValue {
		return SessionMetadata.reasonAgainst(value, 0) === undefined;
	}

	private static reasonAgainst(value: unknown, depth: number): string | undefined {
		if (depth > MAX_METADATA_VALUE_DEPTH) return `nested deeper than ${MAX_METADATA_VALUE_DEPTH} levels.`;
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
		return MAX_UTF8_BYTES_PER_METADATA_VALUE;
	}
}
