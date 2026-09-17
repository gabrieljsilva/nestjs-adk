/**
 * Reading one file, as the only thing the filesystem source needs from the filesystem.
 *
 * It exists so that caching, path resolution and absence can be proved without a disk: a
 * counting fake answers the same three cases a real directory does. The same seam is what a
 * bundler friendly reader would replace.
 */
export abstract class PromptFileReader {
	/** The file's text, or `undefined` when there is no file at that path. */
	public abstract read(path: string): Promise<string | undefined>;
}
