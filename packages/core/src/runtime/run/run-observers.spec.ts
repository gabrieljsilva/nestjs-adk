import { describe, expect, it } from "vitest";
import { CapturedContexts } from "../diagnostics/captured-contexts";
import { ChunkStream } from "../stream/chunk-stream";
import { RunObservers } from "./run-observers";

describe("RunObservers", () => {
	it("watches nothing by default", () => {
		const observers = RunObservers.none();

		expect(observers.chunks).toBeUndefined();
		expect(observers.context).toBeUndefined();
		expect(observers.isWatched).toBe(false);
	});

	it("carries a chunk sink on its own", () => {
		const observers = RunObservers.streaming(new ChunkStream());

		expect(observers.chunks).toBeDefined();
		expect(observers.context).toBeUndefined();
		expect(observers.isWatched).toBe(true);
	});

	it("carries a context capture on its own", () => {
		const observers = RunObservers.capturing(new CapturedContexts());

		expect(observers.context).toBeDefined();
		expect(observers.chunks).toBeUndefined();
		expect(observers.isWatched).toBe(true);
	});
});
