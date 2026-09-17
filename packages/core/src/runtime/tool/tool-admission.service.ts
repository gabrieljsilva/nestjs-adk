export class ToolAdmission {
	private constructor(
		public readonly isAdmitted: boolean,
		public readonly values: Record<string, unknown>,
		public readonly reason: string,
		public readonly wasDenied: boolean,
	) {
		Object.freeze(this);
	}

	public static admitted(values: Record<string, unknown>): ToolAdmission {
		return new ToolAdmission(true, { ...values }, "", false);
	}

	public static invalid(reason: string): ToolAdmission {
		return new ToolAdmission(false, {}, reason, false);
	}

	public static denied(reason: string): ToolAdmission {
		return new ToolAdmission(false, {}, reason, true);
	}
}
