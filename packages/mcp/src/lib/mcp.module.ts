import { ToolsetResolver } from "@nestjs-adk/core";
import { type DynamicModule, Global, Module } from "@nestjs/common";
import { McpClient } from "./mcp-client";
import { MCP_OPTIONS, type McpModuleOptions } from "./mcp-options";

/**
 * Consumes external MCP servers as tools.
 * @Global: the ToolsetResolver becomes visible to the AdkModule's AgentRunner.
 */
@Global()
@Module({})
export class McpModule {
	public static forRoot(options: McpModuleOptions): DynamicModule {
		return {
			module: McpModule,
			providers: [
				{ provide: MCP_OPTIONS, useValue: options },
				McpClient,
				{ provide: ToolsetResolver, useExisting: McpClient },
			],
			exports: [ToolsetResolver, McpClient],
		};
	}
}
