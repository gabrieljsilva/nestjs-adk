import { McpToolName } from "./mcp-tool-name";

/**
 * The one place that answers whether a tool of a source may be used.
 *
 * Declaration and execution both ask it, and that is the whole point: a filter applied only where
 * the catalog is built hides a tool from the model without stopping the call, and a tool result
 * enters the model's context from a third party, so a compromised server can name a tool the user
 * switched off and a model can hallucinate one. The next path that reaches a tool asks here too,
 * rather than growing a second copy of the rule that will be forgotten.
 *
 * Both lists carry the server's raw tool names, never the published `mcp__<source>__<tool>` form:
 * the prefix is presentation and may change, while what an application stored is what the server
 * called the tool.
 */
export class McpToolFilter {
	private readonly allowed?: ReadonlySet<string>;
	private readonly denied: ReadonlySet<string>;

	public constructor(allowed?: readonly string[], denied?: readonly string[]) {
		this.allowed = allowed ? new Set(allowed) : undefined;
		this.denied = new Set(denied ?? []);
	}

	/**
	 * Denial wins over permission when both lists name a tool: the two express opposite intents, and
	 * the only combination that fails safe is the one where switching something off is final.
	 */
	public admits(tool: string): boolean {
		if (!McpToolName.isUsable(tool)) return false;
		if (this.denied.has(tool)) return false;
		return !this.allowed || this.allowed.has(tool);
	}
}
