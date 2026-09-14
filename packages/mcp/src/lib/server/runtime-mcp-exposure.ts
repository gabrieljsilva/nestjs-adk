import type { StartedRuntime, ToolCatalog, ToolGate } from "@nestjs-adk/core";
import { McpExposure } from "./mcp-exposure";

/**
 * Reads the runtime on every access rather than once, because the module's providers are built
 * before the runtime is composed and a value captured then would be the one from before the
 * boot finished.
 */
export class RuntimeMcpExposure extends McpExposure {
	public constructor(private readonly host: StartedRuntime) {
		super();
	}

	public get catalog(): ToolCatalog {
		return this.host.runtime.exposed;
	}

	public get gate(): ToolGate {
		return this.host.runtime.gate;
	}
}
