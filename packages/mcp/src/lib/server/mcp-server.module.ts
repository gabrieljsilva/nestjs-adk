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

/**
 * Serves what every `@McpController` of the application published, at one path.
 *
 * The module owns the protocol and the route, and the application owns the two decisions the
 * lib cannot make: who is calling, through the `actors` resolver, and who may call what, through
 * the access policy declared on `AdkModule`. Nothing here checks a credential.
 *
 * The resolver is the application's provider, reached through `imports`, rather than a class
 * this module instantiates: a resolver that checks a token needs the application's own services,
 * and only the module that declares it knows where they come from.
 */
@Module({})
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
