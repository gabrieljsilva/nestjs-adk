import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { UnusableComponentError } from "./errors/unusable-component.error";
import { AGENT_METADATA, TOOL_METADATA } from "./metadata-keys";
import { type ContainerProvider, NestProviderScan } from "./nest-provider-scan";

class SupportAgent {}
class LookupTool {}
class OrdersService {}

Reflect.defineMetadata(AGENT_METADATA, { name: "support" }, SupportAgent);
Reflect.defineMetadata(TOOL_METADATA, { name: "lookup_order" }, LookupTool);

function provider(type: unknown, instance: unknown, isStatic = true): ContainerProvider {
	return {
		name: typeof type === "function" ? type.name : String(type),
		metatype: type,
		instance,
		isDependencyTreeStatic: () => isStatic,
	};
}

describe("NestProviderScan", () => {
	it("keeps the classes that declared something, with the instance NestJS built", () => {
		const agent = new SupportAgent();
		const tool = new LookupTool();

		const scanned = new NestProviderScan().read([provider(SupportAgent, agent), provider(LookupTool, tool)]);

		expect(scanned.map((entry) => entry.name)).toEqual(["SupportAgent", "LookupTool"]);
		expect(scanned.map((entry) => entry.instance)).toEqual([agent, tool]);
	});

	it("ignores the rest of the container, which has nothing to do with a run", () => {
		const scanned = new NestProviderScan().read([
			provider(OrdersService, new OrdersService()),
			provider(undefined, { value: 1 }),
			provider("CONFIG", { value: 2 }),
		]);

		expect(scanned).toEqual([]);
	});

	/**
	 * A scoped agent has no single instance, so there is nothing to bind a handle onto and
	 * nothing to hand a tool call. Saying so is the whole value: skipping it silently is
	 * what turns a wiring mistake into a model calling a tool that answers nothing.
	 */
	it("refuses a component that is not a singleton, and says which one", () => {
		const scan = new NestProviderScan();

		expect(() => scan.read([provider(SupportAgent, new SupportAgent(), false)])).toThrow(UnusableComponentError);
		expect(() => scan.read([provider(SupportAgent, new SupportAgent(), false)])).toThrow(/SupportAgent/);
	});

	it("refuses a component the container has not built, instead of composing around it", () => {
		expect(() => new NestProviderScan().read([provider(LookupTool, undefined)])).toThrow(UnusableComponentError);
	});
});
