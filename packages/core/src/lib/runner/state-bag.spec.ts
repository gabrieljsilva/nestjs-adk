import { z } from "zod";
import { AgentStateInvalidError, AgentStateMissingError } from "../errors";
import { DeltaStateBag } from "./state-bag";

const schema = z.object({ tenantId: z.string().min(1), count: z.number() });
const guard = { schema, agent: "guarded" };

describe("DeltaStateBag", () => {
	it("without a guard keeps the legacy behavior (get/set/delta, no validation)", () => {
		const bag = new DeltaStateBag({ a: 1 });
		bag.set("b", { any: "thing" });

		expect(bag.get("a")).toBe(1);
		expect(bag.delta()).toEqual({ b: { any: "thing" } });
	});

	it("entry: declared keys present are validated by type", () => {
		expect(() => new DeltaStateBag({ tenantId: "t1" }, guard)).not.toThrow();
		expect(() => new DeltaStateBag({ tenantId: { $gt: "" } }, guard)).toThrow(AgentStateInvalidError);
	});

	it("entry: absent declared keys and undeclared keys do not fail", () => {
		expect(() => new DeltaStateBag({ extraneous: { any: "shape" } }, guard)).not.toThrow();
	});

	it("entry error carries agent, key and zod issues", () => {
		try {
			new DeltaStateBag({ count: "NaN" }, guard);
			expect.unreachable();
		} catch (error) {
			const invalid = error as AgentStateInvalidError;
			expect(invalid).toBeInstanceOf(AgentStateInvalidError);
			expect(invalid.key).toBe("count");
			expect(invalid.issues).toBeDefined();
			expect(invalid.message).toContain("guarded");
		}
	});

	it("set: validates declared keys and lets undeclared keys through", () => {
		const bag = new DeltaStateBag({}, guard);

		bag.set("tenantId", "t1");
		bag.set("__adk_hitl", [{ callId: "1" }]);
		expect(() => bag.set("count", "not-a-number")).toThrow(AgentStateInvalidError);

		expect(bag.delta()).toEqual({ tenantId: "t1", __adk_hitl: [{ callId: "1" }] });
	});

	it("set: prototype-chain keys do not resolve as schema fields (no crash, pass-through)", () => {
		const bag = new DeltaStateBag({}, guard);

		expect(() => bag.set("constructor", { any: "thing" })).not.toThrow();
		expect(() => bag.set("__proto__", "x")).not.toThrow();
		expect(() => bag.set("toString", 1)).not.toThrow();
	});

	it("require: returns present values (including falsy) and throws on absent", () => {
		const bag = new DeltaStateBag({ count: 0 }, guard);

		expect(bag.require("count")).toBe(0);
		expect(() => bag.require("tenantId")).toThrow(AgentStateMissingError);
	});
});
