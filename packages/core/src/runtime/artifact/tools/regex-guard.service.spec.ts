import { describe, expect, it } from "vitest";
import { RegexGuard, RejectedPattern } from "./regex-guard.service";

const guard = new RegexGuard();

/** Patterns a model may reasonably write over a report, and none of them backtracks. */
const ACCEPTED = [
	"error",
	"^ERROR: .*$",
	"\\d{4}-\\d{2}-\\d{2}",
	"order [A-Z]-\\d+",
	"(?:GET|POST) /orders",
	"(?<verb>GET|POST) /orders",
	"total: \\s*\\d+(\\.\\d+)?",
	"[a-z]+@[a-z]+\\.[a-z]{2,4}",
	"a{1,100}",
	"failed|refused",
];

/** The shapes the guard exists for, each with what makes it unacceptable. */
const REJECTED: readonly (readonly [string, string])[] = [
	["(a+)+", "a repeated group may not itself repeat"],
	["(a*)*", "a repeated group may not itself repeat"],
	["(a+)*", "a repeated group may not itself repeat"],
	["(a?)+", "a repeated group may not itself repeat"],
	["([a-z]+)*x", "a repeated group may not itself repeat"],
	["(\\d+)+$", "a repeated group may not itself repeat"],
	["(a|a)+", "a repeated group may not itself repeat"],
	["(?:x|y)*z{2}(a{2,}){3}", "a repeated group may not itself repeat"],
	["(a)\\1", "backreferences"],
	["(?=secret)x", "lookahead"],
	["(?<=secret)x", "lookahead"],
	["(?!secret)x", "lookahead"],
	["a{5000}", "repetition may not ask for more"],
	["a{1,5000}", "repetition may not ask for more"],
	["x".repeat(RegexGuard.MAX_PATTERN_CHARACTERS + 1), "longer than"],
	["", "empty"],
	["(unclosed", "does not compile"],
];

describe("RegexGuard", () => {
	for (const pattern of ACCEPTED) {
		it(`compiles ${pattern}, which is an ordinary search`, () => {
			const built = guard.build(pattern);

			expect(built).toBeInstanceOf(RegExp);
			expect((built as RegExp).flags).toBe("g");
		});
	}

	for (const [pattern, reason] of REJECTED) {
		it(`refuses ${pattern || "an empty pattern"}`, () => {
			const built = guard.build(pattern);

			expect(built).toBeInstanceOf(RejectedPattern);
			expect((built as RejectedPattern).reason).toContain(reason);
		});
	}

	it("gives the model nothing to choose about flags", () => {
		expect((guard.build("a.b") as RegExp).flags).toBe("g");
	});

	it("reads a parenthesis inside a character class as a character, not as a group", () => {
		expect(guard.build("[()]+")).toBeInstanceOf(RegExp);
	});

	it("reads an escaped parenthesis as a character, not as a group", () => {
		expect(guard.build("\\(a\\)+")).toBeInstanceOf(RegExp);
	});
});
