import { readFile } from "node:fs/promises";
import { PromptFileUnreadableError } from "./errors/prompt-file-unreadable.error";
import { PromptFileReader } from "./prompt-file-reader.contract";

const ABSENT_FILE_ERROR_CODES = new Set(["ENOENT", "ENOTDIR"]);

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
		return typeof code === "string" && ABSENT_FILE_ERROR_CODES.has(code);
	}
}
