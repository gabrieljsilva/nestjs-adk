import "reflect-metadata";
import { INJECTABLE_WATERMARK } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { MCP_CONTROLLER_METADATA } from "../../../adapters/nest/metadata-keys";
import { McpController } from "./mcp-controller.decorator";

class LookupTool {}

describe("@McpController", () => {
	it("records the tools it publishes on the class", () => {
		@McpController({ tools: [LookupTool] })
		class OrdersMcp {}

		expect(Reflect.getMetadata(MCP_CONTROLLER_METADATA, OrdersMcp)).toEqual({ tools: [LookupTool] });
	});

	it("declares a controller with no shared tools when given nothing", () => {
		@McpController()
		class OrdersMcp {}

		expect(Reflect.getMetadata(MCP_CONTROLLER_METADATA, OrdersMcp)).toEqual({});
	});

	it("makes the class a provider, so NestJS builds it with its dependencies", () => {
		@McpController()
		class OrdersMcp {}

		expect(Reflect.getMetadata(INJECTABLE_WATERMARK, OrdersMcp)).toBe(true);
	});
});
