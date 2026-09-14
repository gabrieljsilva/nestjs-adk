/**
 * What an access policy answered about one call.
 *
 * A refusal carries its reason because two readers need it: the model, which has to understand
 * why the tool did not run, and an MCP client, which shows it to a person. A bare boolean would
 * leave both guessing.
 */
export class ToolAccess {
	private constructor(
		public readonly isGranted: boolean,
		public readonly reason: string,
	) {
		Object.freeze(this);
	}

	public static granted(): ToolAccess {
		return new ToolAccess(true, "");
	}

	public static denied(reason: string): ToolAccess {
		const trimmed = reason.trim();
		return new ToolAccess(false, trimmed.length === 0 ? "Access to this tool was denied." : trimmed);
	}

	public get isDenied(): boolean {
		return !this.isGranted;
	}
}
