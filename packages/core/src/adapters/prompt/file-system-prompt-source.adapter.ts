import { isAbsolute, resolve } from "node:path";
import { PromptSource } from "../../contracts/model/prompt-source.contract";
import { FsPromptFileReader } from "./fs-prompt-file-reader.adapter";
import { PromptFileCache } from "./prompt-file-cache.service";
import type { PromptFileReader } from "./prompt-file-reader.contract";

const DEFAULT_PROMPT_DIR = "./prompts";

/**
 * Prompts as files. An absolute path is used as it is, a path starting with `./` or `../`
 * resolves from the working directory, and anything else is a name under the prompts
 * directory, `./prompts` unless another is given.
 *
 * A relative path is not resolved next to the source file. An agent that wants a prompt beside
 * itself passes `resolve(import.meta.dirname, "support.md")`.
 */
export class FileSystemPromptSource extends PromptSource {
	private readonly cache = new PromptFileCache();

	public constructor(
		private readonly dir: string = DEFAULT_PROMPT_DIR,
		private readonly reader: PromptFileReader = new FsPromptFileReader(),
	) {
		super();
	}

	public async load(name: string): Promise<string | undefined> {
		const path = this.describe(name);
		return await this.cache.through(path, () => this.reader.read(path));
	}

	public describe(name: string): string {
		if (isAbsolute(name)) return name;
		if (name.startsWith("./") || name.startsWith("../")) return resolve(name);
		return resolve(this.dir, name);
	}
}
