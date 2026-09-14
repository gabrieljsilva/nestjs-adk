import { describe, expect, it } from "vitest";
import { ToolCallObserver } from "../../contracts/tool-call-observer";
import { CapturedContexts } from "../diagnostics/captured-contexts";
import { ChunkStream } from "../stream/chunk-stream";
import { RunObservers } from "./run-observers";

class SilentObserver extends ToolCallObserver {
	public requested(): void {}

	public settled(): void {}
}

describe("RunObservers", () => {
	it("watches nothing by default", () => {
		const observers = RunObservers.none();

		expect(observers.chunks).toBeUndefined();
		expect(observers.context).toBeUndefined();
		expect(observers.tools).toBeUndefined();
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

	it("carries a tool call observer on its own", () => {
		const observers = RunObservers.watchingTools(new SilentObserver());

		expect(observers.tools).toBeDefined();
		expect(observers.chunks).toBeUndefined();
		expect(observers.isWatched).toBe(true);
	});

	it("adds a tool call observer on top of what was already watching", () => {
		const chunks = new ChunkStream();
		const tools = new SilentObserver();

		const observers = RunObservers.streaming(chunks).watchingTools(tools);

		expect(observers.chunks).toBe(chunks);
		expect(observers.tools).toBe(tools);
	});

	it("hands the same value back when there is nothing to add", () => {
		const observers = RunObservers.streaming(new ChunkStream());

		expect(observers.watchingTools(undefined)).toBe(observers);
	});
});
