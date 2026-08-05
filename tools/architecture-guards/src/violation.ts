import type { SourcePath } from "./source-path";

/** A rule that a specific file broke, reported with enough detail to fix it. */
export class Violation {
	public constructor(
		public readonly path: SourcePath,
		public readonly rule: string,
		public readonly line: number,
		public readonly message: string,
	) {}

	public describe(): string {
		return `${this.path.value}:${this.line} [${this.rule}] ${this.message}`;
	}
}
