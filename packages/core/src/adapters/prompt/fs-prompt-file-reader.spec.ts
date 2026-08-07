import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PromptFileUnreadableError } from "./errors/prompt-file-unreadable.error";
import { FsPromptFileReader } from "./fs-prompt-file-reader";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("FsPromptFileReader", () => {
	it("reads a file as text", async () => {
		const text = await new FsPromptFileReader().read(join(FIXTURES, "support.md"));

		expect(text).toContain("You are support for {{{store}}}.");
	});

	/** Absence is the source's normal answer, so it must not arrive as a failure. */
	it("answers nothing for a file that does not exist", async () => {
		expect(await new FsPromptFileReader().read(join(FIXTURES, "nothing-here.md"))).toBeUndefined();
	});

	it("answers nothing when a directory in the path does not exist either", async () => {
		expect(await new FsPromptFileReader().read(join(FIXTURES, "support.md", "deeper.md"))).toBeUndefined();
	});

	/**
	 * The other thing that can happen, and the reason absence is decided by the error code
	 * rather than by whether reading threw: a path that points at a directory is a broken
	 * configuration, and reporting it as a prompt nobody wrote would hide it.
	 */
	it("fails for a path that is not a file", async () => {
		await expect(new FsPromptFileReader().read(FIXTURES)).rejects.toBeInstanceOf(PromptFileUnreadableError);
	});
});
