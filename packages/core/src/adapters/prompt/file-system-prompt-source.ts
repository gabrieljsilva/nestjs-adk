import { isAbsolute, resolve } from "node:path";
import { PromptSource } from "../../contracts/prompt-source";
import { FsPromptFileReader } from "./fs-prompt-file-reader";
import { PromptFileCache } from "./prompt-file-cache";
import type { PromptFileReader } from "./prompt-file-reader";

/** Where a plain name lives when the application named no directory of its own. */
const DEFAULT_DIR = "./prompts";

/**
 * Prompts as files, which is what a repository of them usually is.
 *
 * Three rules decide which file, and they are the ones this library shipped before:
 *
 * - an absolute path is used as it is;
 * - a path starting with `./` or `../` resolves from the working directory;
 * - anything else is a name under the prompts directory, subfolders included.
 *
 * The middle rule is worth being explicit about, because a relative path in a source file
 * usually means "next to this file" and here it does not: the working directory is where
 * the process was started. An agent that wants a prompt next to itself passes an absolute
 * path built from its own location, `resolve(import.meta.dirname, "support.md")`. The
 * previous version guessed that location by parsing a stack trace, which broke under
 * bundlers and made the answer depend on which frame happened to be on top.
 */
export class FileSystemPromptSource extends PromptSource {
	private readonly cache = new PromptFileCache();

	public constructor(
		private readonly dir: string = DEFAULT_DIR,
		private readonly reader: PromptFileReader = new FsPromptFileReader(),
	) {
		super();
	}

	public async load(name: string): Promise<string | undefined> {
		const path = this.describe(name);
		return await this.cache.through(path, () => this.reader.read(path));
	}

	/** The absolute path this name resolves to, which is also the cache key. */
	public describe(name: string): string {
		if (isAbsolute(name)) return name;
		if (name.startsWith("./") || name.startsWith("../")) return resolve(name);
		return resolve(this.dir, name);
	}
}
