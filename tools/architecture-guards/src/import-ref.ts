/** A module referenced by an import or export declaration, and where it appears. */
export class ImportRef {
	public constructor(
		public readonly module: string,
		public readonly line: number,
	) {}

	public get isRelative(): boolean {
		return this.module.startsWith(".");
	}
}
