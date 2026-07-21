import { toolset } from "@nestjs-adk/core";

export { McpClient } from "./lib/mcp-client";
export { McpModule } from "./lib/mcp.module";
export type { McpModuleOptions, McpServerConfig, McpTransportConfig } from "./lib/mcp-options";
export { jsonSchemaToZod } from "./lib/json-schema-to-zod";

/** Semantic sugar over the core's `toolset()`: `@Agent({ tools: [mcpTools('github', ['create_issue'])] })`. */
export const mcpTools = toolset;
