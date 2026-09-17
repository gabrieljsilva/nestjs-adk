import type { ToolCatalog, ToolGate } from "@nestjs-adk/core";

/** What the server needs of the runtime: the published tools and the gate every call goes through. */
export abstract class McpExposure {
	public abstract get catalog(): ToolCatalog;

	public abstract get gate(): ToolGate;
}
