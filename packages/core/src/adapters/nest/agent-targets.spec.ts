import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AgentTargets } from "./agent-targets";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";
import { AGENT_METADATA } from "./metadata-keys";

class BillingAgent {}
Reflect.defineMetadata(AGENT_METADATA, { name: "billing", description: "Handles money." }, BillingAgent);

class UndecoratedAgent {}

function namesOf(targets: readonly unknown[]): readonly string[] {
	return AgentTargets.namesOf(targets, "SupportAgent", "@TransfersTo");
}

describe("AgentTargets", () => {
	it("takes a name as the name it is", () => {
		expect(namesOf(["billing", "escalation"])).toEqual(["billing", "escalation"]);
	});

	it("reads the name off the class that declared the agent", () => {
		expect(namesOf([BillingAgent])).toEqual(["billing"]);
	});

	/**
	 * The form that exists for a cycle, and the reason resolution is not in the decorator.
	 *
	 * At the moment `@TransfersTo` runs on the first of two agents that reach each other, the
	 * second is still `undefined`. The function defers reading it until the scan, which is
	 * after every module has finished loading.
	 */
	it("calls a function that stands in for a class defined later", () => {
		expect(namesOf([() => BillingAgent])).toEqual(["billing"]);
	});

	it("keeps the order the targets were declared in, whatever form each one took", () => {
		expect(namesOf([BillingAgent, "escalation", () => BillingAgent])).toEqual(["billing", "escalation", "billing"]);
	});

	/** The class is right there in the message, because the fix is a decorator on it. */
	it("refuses a class that never declared an agent, and names it", () => {
		expect(() => namesOf([UndecoratedAgent])).toThrow(InvalidAgentMetadataError);
		expect(() => namesOf([UndecoratedAgent])).toThrow(/UndecoratedAgent, which does not declare @Agent/);
	});

	it("refuses a function that resolves to something that is not an agent", () => {
		expect(() => namesOf([() => UndecoratedAgent])).toThrow(/UndecoratedAgent, which does not declare @Agent/);
	});

	/**
	 * A reference that throws is the case this form exists for, so it must not be relabelled.
	 *
	 * A cycle that really failed to resolve throws a reference error, and answering that with
	 * "does not declare @Agent" sends the reader to a decorator that is already there. The
	 * original error is the only thing that says why, so it travels as the cause.
	 */
	it("reports what a reference threw, and keeps it as the cause", () => {
		const thunk = () => {
			throw new ReferenceError("Cannot access 'BillingAgent' before initialization");
		};

		expect(() => namesOf([thunk])).toThrow(/threw when it was read: Cannot access 'BillingAgent'/);
		expect(() => namesOf([thunk])).not.toThrow(/does not declare @Agent/);
		try {
			namesOf([thunk]);
		} catch (error) {
			expect((error as { cause?: unknown }).cause).toBeInstanceOf(ReferenceError);
		}
	});

	/** A class is recognised before it is called, so its error names the decorator it is missing. */
	it("never calls a class to find out that it is one", () => {
		let called = false;
		class Watching {
			public constructor() {
				called = true;
			}
		}

		expect(() => namesOf([Watching])).toThrow(/the class Watching, which does not declare @Agent/);
		expect(called).toBe(false);
	});

	/**
	 * A subclass answers to its parent's declaration, because reflect metadata walks the
	 * prototype chain. Measured, and worth knowing before subclassing an agent: naming the
	 * subclass in an edge points the edge at the parent, with nothing said about it.
	 */
	it("resolves a subclass of an agent to the name its parent declared", () => {
		class SpecialBillingAgent extends BillingAgent {}

		expect(namesOf([SpecialBillingAgent])).toEqual(["billing"]);
	});

	/** Declaring the decorator and forgetting the name is a different mistake, on a different line. */
	it("says the name is missing rather than the decorator", () => {
		class NamelessAgent {}
		Reflect.defineMetadata(AGENT_METADATA, { description: "Has no name." }, NamelessAgent);

		expect(() => namesOf([NamelessAgent])).toThrow(/NamelessAgent, which declares @Agent without a name/);
	});

	/**
	 * A cycle that really is unresolvable resolves to nothing, and saying so beats a name of
	 * "undefined" reaching the catalog and failing later as a target nobody registered.
	 */
	it("refuses a function that resolves to nothing", () => {
		expect(() => namesOf([() => undefined])).toThrow(/resolved to undefined/);
	});

	it("refuses a target that is neither a name nor a class", () => {
		expect(() => namesOf([42])).toThrow(InvalidAgentMetadataError);
		expect(() => namesOf([42])).toThrow(/@TransfersTo accepts an agent name/);
	});

	it("names the provider that declared the wrong thing", () => {
		expect(() => namesOf([42])).toThrow(/SupportAgent/);
	});
});
