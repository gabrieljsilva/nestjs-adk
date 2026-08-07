import { isAbsolute, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FileSystemPromptSource } from "./file-system-prompt-source";
import { PromptFileReader } from "./prompt-file-reader";

/** Answers from a map of paths and counts what was asked for, so nothing here touches a disk. */
class FakeReader extends PromptFileReader {
	public readonly reads: string[] = [];

	public constructor(private readonly files: Record<string, string> = {}) {
		super();
	}

	public async read(path: string): Promise<string | undefined> {
		this.reads.push(path);
		return this.files[path];
	}
}

function sourceOf(files: Record<string, string> = {}, dir?: string) {
	const reader = new FakeReader(files);
	return { reader, source: new FileSystemPromptSource(dir, reader) };
}

describe("FileSystemPromptSource", () => {
	describe("which file a name resolves to", () => {
		it("puts a plain name under the prompts directory", () => {
			const { source } = sourceOf({}, "/app/prompts");

			expect(source.describe("support.md")).toBe("/app/prompts/support.md");
		});

		it("keeps a subfolder inside the prompts directory", () => {
			const { source } = sourceOf({}, "/app/prompts");

			expect(source.describe("sales/quote.md")).toBe("/app/prompts/sales/quote.md");
		});

		it("uses an absolute path exactly as it was given", () => {
			const { source } = sourceOf({}, "/app/prompts");

			expect(source.describe("/etc/adk/support.md")).toBe("/etc/adk/support.md");
		});

		/**
		 * Not relative to the file that asked, which is what the previous version guessed at by
		 * parsing a stack trace. An agent that wants a prompt next to itself builds the absolute
		 * path from its own location instead.
		 */
		it("resolves a dot path from the working directory", () => {
			const { source } = sourceOf();

			expect(source.describe("./local/support.md")).toBe(resolve("./local/support.md"));
			expect(source.describe("../shared/support.md")).toBe(resolve("../shared/support.md"));
		});

		it("looks under ./prompts when the module named no directory", () => {
			const { source } = sourceOf();

			expect(source.describe("support.md")).toBe(resolve("./prompts", "support.md"));
		});

		it("always describes an absolute path, which is what an error has to print", () => {
			const { source } = sourceOf({}, "prompts");

			expect(isAbsolute(source.describe("support.md"))).toBe(true);
		});
	});

	it("serves the file the name resolved to", async () => {
		const { source } = sourceOf({ "/app/prompts/support.md": "You are support." }, "/app/prompts");

		expect(await source.load("support.md")).toBe("You are support.");
	});

	it("answers nothing for a file that is not there, rather than throwing", async () => {
		const { source } = sourceOf({}, "/app/prompts");

		expect(await source.load("support.md")).toBeUndefined();
	});

	/** A prompt file does not change while the process runs, and a syscall per run would. */
	it("reads the file once and serves it from memory afterwards", async () => {
		const { source, reader } = sourceOf({ "/app/prompts/support.md": "You are support." }, "/app/prompts");

		await source.load("support.md");
		await source.load("support.md");
		await source.load("support.md");

		expect(reader.reads).toEqual(["/app/prompts/support.md"]);
	});

	it("caches by resolved path, so the same file asked for two ways is read once", async () => {
		const { source, reader } = sourceOf({ "/app/prompts/support.md": "You are support." }, "/app/prompts");

		await source.load("support.md");
		await source.load("/app/prompts/support.md");

		expect(reader.reads).toEqual(["/app/prompts/support.md"]);
	});

	it("lets what the reader threw travel out, because unreadable is not absent", async () => {
		class FailingReader extends PromptFileReader {
			public async read(): Promise<string | undefined> {
				throw new Error("EACCES: permission denied");
			}
		}

		const source = new FileSystemPromptSource("/app/prompts", new FailingReader());

		await expect(source.load("support.md")).rejects.toThrow("EACCES");
	});
});
