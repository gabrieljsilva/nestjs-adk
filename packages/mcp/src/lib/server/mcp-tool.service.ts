import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { type Actor, ToolContext, ToolInvocation, ToolOutput } from "@nestjs-adk/core";
import type { McpCall } from "./mcp-call.value-object";
import type { McpExposure } from "./mcp-exposure.contract";
import { McpToolAnnotations } from "./mcp-tool-annotations.value-object";

/**
 * The two things an MCP server does with the tools the controllers published: list them, and
 * run one for an actor.
 *
 * A call goes through the runtime's own gate before the handler runs, which is the same object
 * the agent loop admits calls with. Arguments the schema refuses and actors the policy refuses
 * come back as an error result the client can show, never as a thrown error, because from the
 * protocol's point of view the request itself was well formed.
 */
export class McpToolService {
	public constructor(private readonly exposure: McpExposure) {}

	public list(): Tool[] {
		const catalog = this.exposure.catalog;
		return catalog.names.map((name) => {
			const tool = catalog.findOrFail(name);
			return {
				name: tool.name,
				description: tool.description,
				inputSchema: McpToolService.schemaOf(tool.schema.declaration()),
				annotations: McpToolAnnotations.of(tool.effect).toJSON(),
			};
		});
	}

	public async call(name: string, args: unknown, actor: Actor, call: McpCall): Promise<CallToolResult> {
		const exposed = this.exposure.catalog;
		if (!exposed.has(name)) return McpToolService.refused(`Unknown tool: ${name}.`);
		const tool = exposed.findOrFail(name);

		const admission = await this.exposure.gate.admit(tool, new ToolInvocation(call.callId, name, args ?? {}), actor);
		if (!admission.isAdmitted) return McpToolService.refused(admission.reason);

		const context = new ToolContext(call.sessionId, call.runId, call.agent, call.callId, call.signal, actor);
		try {
			return McpToolService.answered(await tool.handler.invoke(admission.values, context));
		} catch (error) {
			return McpToolService.refused(error instanceof Error ? error.message : String(error));
		}
	}

	private static schemaOf(declaration: unknown): Tool["inputSchema"] {
		if (typeof declaration === "object" && declaration !== null && !Array.isArray(declaration)) {
			return { ...declaration, type: "object" };
		}
		return { type: "object" };
	}

	private static answered(produced: unknown): CallToolResult {
		const data = produced instanceof ToolOutput ? produced.data : produced;
		const text = McpToolService.textOf(data);
		const structured = typeof data === "object" && data !== null && !Array.isArray(data) ? { ...data } : undefined;
		return {
			content: [{ type: "text", text }],
			...(structured === undefined ? {} : { structuredContent: structured }),
		};
	}

	private static refused(reason: string): CallToolResult {
		return { content: [{ type: "text", text: reason }], isError: true };
	}

	private static textOf(data: unknown): string {
		if (data === undefined || data === null) return "";
		return typeof data === "string" ? data : JSON.stringify(data);
	}
}
