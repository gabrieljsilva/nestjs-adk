import { describe, expect, it } from "vitest";
import { OffloadDecision } from "./offload-decision.value-object";
import { OffloadPolicy } from "./offload.policy";

/** A policy that answers whatever it was built with, so the base class is what is under test. */
class FixedOffloadPolicy extends OffloadPolicy {
	public constructor(private readonly decision: OffloadDecision) {
		super();
	}

	public decide(_characters: number, _mediaType?: string): OffloadDecision {
		return this.decision;
	}

	public get isEnabled(): boolean {
		return true;
	}

	public get thresholdCharacters(): number | undefined {
		return undefined;
	}
}

describe("OffloadPolicy", () => {
	it("reads whether content leaves the context off the one decision, so the two cannot disagree", () => {
		expect(new FixedOffloadPolicy(OffloadDecision.INLINE).shouldOffload(1_000_000)).toBe(false);
		expect(new FixedOffloadPolicy(OffloadDecision.OPAQUE).shouldOffload(1)).toBe(true);
		expect(new FixedOffloadPolicy(OffloadDecision.EXPLORABLE).shouldOffload(1)).toBe(true);
	});

	it("passes the media type through, because a policy deciding on it needs to see it", () => {
		const seen: (string | undefined)[] = [];
		class RecordingPolicy extends FixedOffloadPolicy {
			public override decide(_characters: number, mediaType?: string): OffloadDecision {
				seen.push(mediaType);
				return OffloadDecision.INLINE;
			}
		}

		new RecordingPolicy(OffloadDecision.INLINE).shouldOffload(10, "application/json");

		expect(seen).toEqual(["application/json"]);
	});
});
