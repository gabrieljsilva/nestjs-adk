/** What an access policy answered about one call. A denial always carries a reason the model and an MCP client can read. */
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
