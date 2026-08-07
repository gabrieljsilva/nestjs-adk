import { describe, expect, it } from "vitest";
import { PromptFileCache } from "./prompt-file-cache";

/** Counts calls and lets a test decide when each one finishes. */
function counter(answer: () => Promise<string | undefined>) {
	let calls = 0;
	return {
		get calls() {
			return calls;
		},
		read: () => {
			calls += 1;
			return answer();
		},
	};
}

describe("PromptFileCache", () => {
	it("reads once and serves the same text afterwards", async () => {
		const cache = new PromptFileCache();
		const reader = counter(async () => "You are support.");

		expect(await cache.through("/prompts/support.md", reader.read)).toBe("You are support.");
		expect(await cache.through("/prompts/support.md", reader.read)).toBe("You are support.");
		expect(reader.calls).toBe(1);
	});

	it("keys by path, so two prompts are two entries", async () => {
		const cache = new PromptFileCache();
		const reader = counter(async () => "text");

		await cache.through("/prompts/a.md", reader.read);
		await cache.through("/prompts/b.md", reader.read);

		expect(reader.calls).toBe(2);
	});

	/**
	 * Ten runs starting at once are the normal case for a booted application. Storing the read
	 * rather than its result is what makes them share one open instead of all missing the cache.
	 */
	it("shares one read between callers that arrive before it finishes", async () => {
		const cache = new PromptFileCache();
		const pending: { release?: (text: string) => void } = {};
		const reader = counter(
			() =>
				new Promise<string>((resolve) => {
					pending.release = resolve;
				}),
		);

		const both = Promise.all([
			cache.through("/prompts/support.md", reader.read),
			cache.through("/prompts/support.md", reader.read),
		]);
		pending.release?.("You are support.");

		expect(await both).toEqual(["You are support.", "You are support."]);
		expect(reader.calls).toBe(1);
	});

	/** A prompt file added after the first miss has to be found, or a deploy order becomes a rule. */
	it("does not remember an absence", async () => {
		const cache = new PromptFileCache();
		const file: { text?: string } = {};
		const reader = counter(async () => file.text);

		expect(await cache.through("/prompts/support.md", reader.read)).toBeUndefined();
		file.text = "You are support.";

		expect(await cache.through("/prompts/support.md", reader.read)).toBe("You are support.");
		expect(reader.calls).toBe(2);
	});

	it("does not remember a failure, and lets it out to whoever asked", async () => {
		const cache = new PromptFileCache();
		let failing = true;
		const reader = counter(async () => {
			if (failing) throw new Error("EACCES");
			return "You are support.";
		});

		await expect(cache.through("/prompts/support.md", reader.read)).rejects.toThrow("EACCES");
		failing = false;

		expect(await cache.through("/prompts/support.md", reader.read)).toBe("You are support.");
		expect(reader.calls).toBe(2);
	});
});
