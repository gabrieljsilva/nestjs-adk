import type { SourceFile } from "./source-file";

/** Every file the guard scanned, queryable by path. */
export class SourceIndex {
	private readonly byPath: ReadonlyMap<string, SourceFile>;

	public constructor(public readonly files: readonly SourceFile[]) {
		this.byPath = new Map(files.map((file) => [file.path.value, file]));
	}

	public has(path: string): boolean {
		return this.byPath.has(path);
	}
}
