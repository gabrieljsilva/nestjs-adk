import { UnknownSessionEventTypeError } from "./errors/unknown-session-event-type.error";
import { UnsupportedSessionEventVersionError } from "./errors/unsupported-session-event-version.error";
import type { EventHeader } from "./event-header";
import { EventSchemaVersion } from "./event-schema-version";
import type { EventUpcaster } from "./event-upcaster";
import type { SessionEvent } from "./session-event";
import type { SessionEventCodec } from "./session-event-codec";

/**
 * Resolves a stored record back into the concrete event class.
 *
 * A payload older than the codec walks the upcaster chain first, one version at a
 * time. A payload newer than the codec stops execution: reading it would silently
 * drop meaning this build does not know about.
 */
export class SessionEventRegistry {
	private readonly codecs = new Map<string, SessionEventCodec<SessionEvent>>();
	private readonly upcasters = new Map<string, EventUpcaster[]>();

	public register(codec: SessionEventCodec<SessionEvent>): this {
		this.codecs.set(codec.type, codec);
		return this;
	}

	public registerUpcaster(upcaster: EventUpcaster): this {
		const chain = this.upcasters.get(upcaster.type) ?? [];
		chain.push(upcaster);
		chain.sort((left, right) => left.from.value - right.from.value);
		this.upcasters.set(upcaster.type, chain);
		return this;
	}

	public get types(): readonly string[] {
		return [...this.codecs.keys()];
	}

	public codecFor(type: string): SessionEventCodec<SessionEvent> {
		const codec = this.codecs.get(type);
		if (codec === undefined) throw new UnknownSessionEventTypeError(type);
		return codec;
	}

	public decode(
		type: string,
		storedVersion: number,
		payload: Readonly<Record<string, unknown>>,
		header: EventHeader,
	): SessionEvent {
		const codec = this.codecFor(type);
		const found = EventSchemaVersion.of(storedVersion);
		if (found.isAfter(codec.schemaVersion)) {
			throw new UnsupportedSessionEventVersionError(type, found.value, codec.schemaVersion.value);
		}
		return codec.decode(this.upcast(type, found, payload, codec.schemaVersion), header);
	}

	private upcast(
		type: string,
		from: EventSchemaVersion,
		payload: Readonly<Record<string, unknown>>,
		target: EventSchemaVersion,
	): Record<string, unknown> {
		let current = from;
		let carried: Record<string, unknown> = { ...payload };
		for (const upcaster of this.upcasters.get(type) ?? []) {
			if (!upcaster.from.equals(current)) continue;
			carried = upcaster.upcast(carried);
			current = upcaster.to;
			if (current.equals(target)) break;
		}
		return carried;
	}
}
