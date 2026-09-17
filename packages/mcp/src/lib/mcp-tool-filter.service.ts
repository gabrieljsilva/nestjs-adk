import { McpToolName } from "./mcp-tool-name.value-object";

export class McpToolFilter {
	private readonly allowed?: ReadonlySet<string>;
	private readonly denied: ReadonlySet<string>;

	public constructor(allowed?: readonly string[], denied?: readonly string[]) {
		this.allowed = allowed ? new Set(allowed) : undefined;
		this.denied = new Set(denied ?? []);
	}

	public admits(tool: string): boolean {
		if (!McpToolName.isUsable(tool)) return false;
		if (this.denied.has(tool)) return false;
		return !this.allowed || this.allowed.has(tool);
	}
}
