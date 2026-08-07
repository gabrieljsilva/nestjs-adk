import { readFile } from "node:fs/promises";
import { PromptFileUnreadableError } from "./errors/prompt-file-unreadable.error";
import { PromptFileReader } from "./prompt-file-reader";

/** The two codes that mean there is nothing at that path, as opposed to something unreadable. */
const ABSENT = new Set(["ENOENT", "ENOTDIR"]);

/** Reads from the real filesystem, and tells an absence apart from a failure. */
export class FsPromptFileReader extends PromptFileReader {
	public async read(path: string): Promise<string | undefined> {
		try {
			return await readFile(path, "utf8");
		} catch (cause) {
			if (FsPromptFileReader.isAbsent(cause)) return undefined;
			throw new PromptFileUnreadableError(path, cause);
		}
	}

	private static isAbsent(cause: unknown): boolean {
		if (typeof cause !== "object" || cause === null) return false;
		const code = Reflect.get(cause, "code");
		return typeof code === "string" && ABSENT.has(code);
	}
}
