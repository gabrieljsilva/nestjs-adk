/**
 * How a prompt file is read from wherever prompts live. Implement it to serve prompts from
 * something other than the file system.
 *
 * Answering `undefined` means the file is absent, which is not an error; anything that stops
 * a file that exists from being read is raised instead.
 */
export abstract class PromptFileReader {
	public abstract read(path: string): Promise<string | undefined>;
}
