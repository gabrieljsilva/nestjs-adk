import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { UnusableComponentError } from "./errors/unusable-component.error";
import { AGENT_METADATA, TOOL_METADATA } from "./metadata-keys";
import { type ContainerProvider, NestProviderScan } from "./nest-provider-scan";

class SupportAgent {}
class LookupTool {}
class OrdersService {}
/** What a double registered through `useClass` looks like: no decorators of its own. */
class LookupToolDouble {}

Reflect.defineMetadata(AGENT_METADATA, { name: "support" }, SupportAgent);
Reflect.defineMetadata(TOOL_METADATA, { name: "lookup_order" }, LookupTool);

function provider(type: unknown, instance: unknown, isStatic = true): ContainerProvider {
	return {
		name: typeof type === "function" ? type.name : String(type),
		token: type,
		metatype: type,
		instance,
		isDependencyTreeStatic: () => isStatic,
	};
}

/** A provider NestJS registered under one thing and serves with another. */
function overridden(token: unknown, metatype: unknown, instance: unknown): ContainerProvider {
	return { ...provider(token, instance), metatype };
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

	/**
	 * The three shapes a substitution takes, and what each leaves behind.
	 *
	 * NestJS rewrites the metatype every time: a value leaves none, a class leaves the
	 * replacement, a factory leaves an anonymous function. Reading the declaration off the
	 * metatype is therefore reading whatever the override happened to put there, which is why
	 * the token answers first: it is the only part of a provider an override never touches.
	 */
	it("reads the declaration off the token, so a substituted component keeps it", () => {
		const value = { execute: () => "stubbed" };
		const built = new LookupToolDouble();

		const scanned = new NestProviderScan().read([
			overridden(LookupTool, null, value),
			overridden(SupportAgent, LookupToolDouble, built),
		]);

		expect(scanned.map((entry) => entry.type)).toEqual([LookupTool, SupportAgent]);
		expect(scanned.map((entry) => entry.instance)).toEqual([value, built]);
	});

	/** The instance is still whatever the container serves: only the declaration comes from the token. */
	it("keeps the instance the override put there, next to the declaration it replaced", () => {
		const double = { execute: () => "stubbed" };

		const scanned = new NestProviderScan().read([overridden(LookupTool, LookupToolDouble, double)]);

		expect(scanned.at(0)?.type).toBe(LookupTool);
		expect(scanned.at(0)?.instance).toBe(double);
	});

	/** A component registered under a token of its own declares itself through the metatype. */
	it("falls back to the metatype when the token is not a class", () => {
		const tool = new LookupTool();

		const scanned = new NestProviderScan().read([overridden("LOOKUP_TOOL", LookupTool, tool)]);

		expect(scanned.map((entry) => entry.type)).toEqual([LookupTool]);
	});

	it("ignores a substituted provider that declared nothing on either side", () => {
		const scanned = new NestProviderScan().read([overridden(OrdersService, LookupToolDouble, {})]);

		expect(scanned).toEqual([]);
	});
});
