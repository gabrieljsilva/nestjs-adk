import { describe, expect, it } from "vitest";
import { OffloadDecision } from "./offload-decision.value-object";

describe("OffloadDecision", () => {
	it("names the three things that can happen to a result", () => {
		expect(OffloadDecision.INLINE.name).toBe("inline");
		expect(OffloadDecision.OPAQUE.name).toBe("opaque");
		expect(OffloadDecision.EXPLORABLE.name).toBe("explorable");
	});

	it("tells inline apart, because it is the one decision with no artifact behind it", () => {
		expect(OffloadDecision.INLINE.isInline).toBe(true);
		expect(OffloadDecision.OPAQUE.isInline).toBe(false);
		expect(OffloadDecision.EXPLORABLE.isInline).toBe(false);
	});

	it("tells explorable apart, because it is what decides which tools the model is offered", () => {
		expect(OffloadDecision.EXPLORABLE.isExplorable).toBe(true);
		expect(OffloadDecision.OPAQUE.isExplorable).toBe(false);
	});

	it("reads a name back, and answers nothing for one nobody declared", () => {
		expect(OffloadDecision.fromName("explorable")).toBe(OffloadDecision.EXPLORABLE);
		expect(OffloadDecision.fromName("shredded")).toBeUndefined();
	});

	it("compares by name and reads as its name", () => {
		expect(OffloadDecision.OPAQUE.equals(OffloadDecision.OPAQUE)).toBe(true);
		expect(OffloadDecision.OPAQUE.equals(OffloadDecision.INLINE)).toBe(false);
		expect(`${OffloadDecision.OPAQUE}`).toBe("opaque");
	});
});
