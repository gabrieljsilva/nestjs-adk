import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DuplicateExposedToolError } from "../errors/duplicate-exposed-tool.error";
import { UnregisteredToolError } from "../errors/unregistered-tool.error";
import { INLINE_TOOLS_METADATA, MCP_CONTROLLER_METADATA, TOOL_METADATA } from "../metadata/metadata-keys";
import { NestAgentScanner } from "./nest-agent-scanner";
import { NestControllerScanner } from "./nest-controller-scanner";
import { ScannedProvider } from "./scanned-provider";

const schema = z.object({ orderId: z.string() });

class LookupTool {
	public execute(): unknown {
		return { found: true };
	}
}
Reflect.defineMetadata(
	TOOL_METADATA,
	{ name: "lookup_order", description: "Finds.", schema, effect: "read" },
	LookupTool,
);

class OrdersController {
	public audit(): unknown {
		return { changed: 0 };
	}
}
Reflect.defineMetadata(MCP_CONTROLLER_METADATA, { tools: [LookupTool] }, OrdersController);
Reflect.defineMetadata(
	INLINE_TOOLS_METADATA,
	[{ method: "audit", options: { name: "audit_orders", description: "Audits.", schema: z.object({}) } }],
	OrdersController,
);

class ReportsController {}
Reflect.defineMetadata(MCP_CONTROLLER_METADATA, { tools: [LookupTool] }, ReportsController);

class Bystander {}

function scanned(type: object, instance: object = new (class {})()): ScannedProvider {
	return new ScannedProvider(String(Reflect.get(type, "name")), type, instance);
}

function scan(providers: ScannedProvider[]) {
	return new NestControllerScanner().scan(providers, new NestAgentScanner().sharedTools(providers));
}

describe("NestControllerScanner", () => {
	it("publishes the shared tools a controller lists and the ones its methods declare", () => {
		const tools = scan([scanned(LookupTool, new LookupTool()), scanned(OrdersController, new OrdersController())]);

		expect(tools.map((tool) => tool.name)).toEqual(["lookup_order", "audit_orders"]);
	});

	it("publishes the very definition an agent would receive for a shared class", () => {
		const providers = [scanned(LookupTool, new LookupTool()), scanned(OrdersController, new OrdersController())];
		const shared = new NestAgentScanner().sharedTools(providers);

		const [published] = new NestControllerScanner().scan(providers, shared);

		expect(published).toBe(shared.get(LookupTool));
	});

	it("ignores providers that are not controllers", () => {
		expect(scan([scanned(LookupTool, new LookupTool()), scanned(Bystander)])).toEqual([]);
	});

	it("refuses a name two controllers publish, naming both", () => {
		const providers = [
			scanned(LookupTool, new LookupTool()),
			scanned(OrdersController, new OrdersController()),
			scanned(ReportsController),
		];

		expect(() => scan(providers)).toThrow(DuplicateExposedToolError);
		expect(() => scan(providers)).toThrow(/OrdersController.*ReportsController/);
	});

	it("publishes a shared tool a controller lists by the name it declared", () => {
		class NamingController {}
		Reflect.defineMetadata(MCP_CONTROLLER_METADATA, { tools: ["lookup_order"] }, NamingController);

		const exposed = scan([scanned(LookupTool, new LookupTool()), scanned(NamingController, new NamingController())]);

		expect(exposed.map((tool) => tool.name)).toEqual(["lookup_order"]);
	});

	it("refuses a listed class no provider declares with @Tool", () => {
		expect(() => scan([scanned(OrdersController, new OrdersController())])).toThrow(UnregisteredToolError);
	});
});
