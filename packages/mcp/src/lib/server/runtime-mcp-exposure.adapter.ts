import type { StartedRuntime, ToolCatalog, ToolGate } from "@nestjs-adk/core";
import { McpExposure } from "./mcp-exposure.contract";

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
