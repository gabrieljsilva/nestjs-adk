/** A tool offered to the model, described by name, purpose and input schema. */
export class ToolDeclaration {
	public constructor(
		public readonly name: string,
		public readonly description: string,
		public readonly parameters: unknown,
	) {}
}
