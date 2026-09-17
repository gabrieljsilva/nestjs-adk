import type { ToolCatalog, ToolGate } from "@nestjs-adk/core";

export abstract class McpExposure {
	public abstract get catalog(): ToolCatalog;

	public abstract get gate(): ToolGate;
}
