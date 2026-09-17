import { AdkRuntime } from "@nestjs-adk/core";
import { type DynamicModule, Module } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { McpActorResolver } from "./mcp-actor-resolver.contract";
import { McpEndpointController } from "./mcp-endpoint.controller";
import { McpServerHost } from "./mcp-server-host.service";
import { McpServerInfo } from "./mcp-server-info.value-object";
import type { McpServerOptions } from "./mcp-server.options";
import { McpToolService } from "./mcp-tool.service";
import { RuntimeMcpExposure } from "./runtime-mcp-exposure.adapter";

const DEFAULT_PATH = "/mcp";

@Module({})
/**
 * Serves what the application's `@McpController` classes publish, as one MCP endpoint at one
 * path.
 *
 * The transport is stateless streamable HTTP, a server per request, so instances behind a
 * balancer answer alike. Every call goes through the core's own gate, so an outside client can
 * do nothing the agent could not.
 */
export class McpServerModule {
	public static forRoot(options: McpServerOptions): DynamicModule {
		return {
			module: McpServerModule,
			imports: [...(options.imports ?? [])],
			controllers: [McpServerModule.endpointAt(options)],
			providers: [
				{ provide: McpActorResolver, useExisting: options.actors },
				{
					provide: McpServerHost,
					useFactory: (host: AdkRuntime) =>
						new McpServerHost(
							new McpToolService(new RuntimeMcpExposure(host)),
							new McpServerInfo(options.name, options.version),
						),
					inject: [AdkRuntime],
				},
			],
		};
	}

	private static endpointAt(options: McpServerOptions): typeof McpEndpointController {
		class McpEndpoint extends McpEndpointController {}
		Reflect.defineMetadata(PATH_METADATA, options.path ?? DEFAULT_PATH, McpEndpoint);
		for (const decorate of options.decorate ?? []) decorate(McpEndpoint);
		return McpEndpoint;
	}
}
