export class McpResponseBody {
	private constructor(private readonly fields: Record<string, unknown>) {}

	public static async read(response: Response): Promise<McpResponseBody> {
		const text = await response.text();
		const type = response.headers?.get("content-type") ?? "";
		if (!type.includes("form-urlencoded")) {
			try {
				const parsed: unknown = JSON.parse(text);
				if (typeof parsed === "object" && parsed !== null) return new McpResponseBody(parsed as Record<string, unknown>);
			} catch {}
		}
		return new McpResponseBody(Object.fromEntries(new URLSearchParams(text)));
	}

	public static async readOrEmpty(response: Response): Promise<McpResponseBody> {
		try {
			return await McpResponseBody.read(response);
		} catch {
			return new McpResponseBody({});
		}
	}

	public text(field: string): string | undefined {
		const value = this.fields[field];
		return typeof value === "string" && value.trim() ? value : undefined;
	}

	public seconds(field: string): number | undefined {
		const value = Number(this.fields[field]);
		return Number.isFinite(value) ? value : undefined;
	}

	public get explanation(): string | undefined {
		return this.text("error_description") ?? this.text("message") ?? this.text("error");
	}

	public get error(): string | undefined {
		return this.text("error");
	}
}
