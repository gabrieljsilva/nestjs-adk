/**
 * The body of an OAuth response, in whichever dialect the provider chose.
 *
 * OAuth allows both JSON and form encoding, and providers disagree: GitHub answers
 * `access_token=...` while most answer JSON. Reading the content type first, and falling back to
 * the other dialect, is cheaper than a per-provider quirk table.
 */
export class McpResponseBody {
	private constructor(private readonly fields: Record<string, unknown>) {}

	public static async read(response: Response): Promise<McpResponseBody> {
		const text = await response.text();
		const type = response.headers?.get("content-type") ?? "";
		if (!type.includes("form-urlencoded")) {
			try {
				const parsed: unknown = JSON.parse(text);
				if (typeof parsed === "object" && parsed !== null) return new McpResponseBody(parsed as Record<string, unknown>);
			} catch {
				// A provider mislabelling form data as JSON is still answering something.
			}
		}
		return new McpResponseBody(Object.fromEntries(new URLSearchParams(text)));
	}

	/** Never throws: a body that decodes into nothing is not worth failing over, the status still speaks. */
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

	/** The most specific thing the provider said about a refusal, reduced to one line worth logging. */
	public get explanation(): string | undefined {
		return this.text("error_description") ?? this.text("message") ?? this.text("error");
	}

	/** An OAuth error can ride on a 200: the status describes the HTTP call, not the grant. */
	public get error(): string | undefined {
		return this.text("error");
	}
}
