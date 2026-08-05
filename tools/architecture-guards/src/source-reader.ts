import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { ScanRoots } from "./scan-roots";
import { SourceFile } from "./source-file";
import { SourceIndex } from "./source-index";
import { SourcePath } from "./source-path";

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "coverage", ".turbo"]);

/** Walks the scan roots and parses every TypeScript file it finds. */
export class SourceReader {
	public constructor(private readonly repositoryRoot: string) {}

	public read(roots: ScanRoots): SourceIndex {
		const files: SourceFile[] = [];
		for (const root of roots.values) {
			this.collect(resolve(this.repositoryRoot, root), files);
		}
		return new SourceIndex(files);
	}

	private collect(directory: string, into: SourceFile[]): void {
		let entries: string[];
		try {
			entries = readdirSync(directory);
		} catch {
			return;
		}
		for (const entry of entries) {
			if (SKIPPED_DIRECTORIES.has(entry)) continue;
			const absolute = join(directory, entry);
			if (statSync(absolute).isDirectory()) {
				this.collect(absolute, into);
				continue;
			}
			if (!entry.endsWith(".ts")) continue;
			const path = SourcePath.of(relative(this.repositoryRoot, absolute));
			into.push(SourceFile.parse(path, readFileSync(absolute, "utf8")));
		}
	}
}
