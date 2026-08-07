import { describe, expect, it } from "vitest";
import { SessionEventCodecs } from "../../../domain/event/session-event-codecs";
import { CheckpointCodec } from "./checkpoint-codec";
import { JournalCodec } from "./journal-codec";
import { SessionHeadCodec } from "./session-head-codec";
import { SnapshotCodec } from "./snapshot-codec";
import { StorageCodecs } from "./storage-codecs";

/** One import for somebody implementing the port, instead of four. */
describe("StorageCodecs", () => {
	it("answers with a codec for each collection a session storage keeps", () => {
		const codecs = StorageCodecs.standard();

		expect(codecs.journal).toBeInstanceOf(JournalCodec);
		expect(codecs.snapshot).toBeInstanceOf(SnapshotCodec);
		expect(codecs.head).toBeInstanceOf(SessionHeadCodec);
		expect(codecs.checkpoint).toBeInstanceOf(CheckpointCodec);
	});

	/** Global state makes two runtimes in one process overwrite each other. */
	it("builds a fresh set each time, so one storage never edits another one's registry", () => {
		expect(StorageCodecs.standard()).not.toBe(StorageCodecs.standard());
	});

	/**
	 * An application that registered an upcaster of its own has to be able to hand that
	 * registry over, or its journal stops being readable by the storage that holds it.
	 */
	it("journals through the registry it was given", () => {
		const registry = SessionEventCodecs.registry();

		const codecs = StorageCodecs.standard(registry);

		expect(codecs.journal).toEqual(new JournalCodec(registry));
	});
});
