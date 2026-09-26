const MAX_PATTERN_CHARACTERS = 200;

const MAX_REPETITION = 100;

export class RejectedPattern {
	public constructor(public readonly reason: string) {}
}

export class RegexGuard {
	public static readonly MAX_PATTERN_CHARACTERS = MAX_PATTERN_CHARACTERS;
	public static readonly MAX_REPETITION = MAX_REPETITION;

	public build(pattern: string, caseSensitive = true): RegExp | RejectedPattern {
		const rejected = this.reject(pattern);
		if (rejected !== undefined) return rejected;
		try {
			return new RegExp(pattern, caseSensitive ? "g" : "gi");
		} catch (cause) {
			return new RejectedPattern(`the pattern does not compile: ${cause instanceof Error ? cause.message : "unknown"}.`);
		}
	}

	private reject(pattern: string): RejectedPattern | undefined {
		if (pattern.length === 0) return new RejectedPattern("the pattern is empty.");
		if (pattern.length > MAX_PATTERN_CHARACTERS) {
			return new RejectedPattern(`the pattern is longer than ${MAX_PATTERN_CHARACTERS} characters.`);
		}
		if (/\\[1-9]/.test(pattern)) return new RejectedPattern("backreferences are not accepted.");
		if (/\(\?(=|!|<=|<!)/.test(pattern)) return new RejectedPattern("lookahead and lookbehind are not accepted.");
		const repetition = this.rejectRepetition(pattern);
		if (repetition !== undefined) return repetition;
		return this.rejectNestedQuantifier(pattern);
	}

	private rejectRepetition(pattern: string): RejectedPattern | undefined {
		for (const match of pattern.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
			const bounds = [match[1], match[2]].filter((bound) => bound !== undefined && bound !== "");
			if (bounds.some((bound) => Number(bound) > MAX_REPETITION)) {
				return new RejectedPattern(`a repetition may not ask for more than ${MAX_REPETITION}.`);
			}
		}
		return undefined;
	}

	private rejectNestedQuantifier(pattern: string): RejectedPattern | undefined {
		const open: number[] = [];
		let inClass = false;
		for (let at = 0; at < pattern.length; at += 1) {
			const character = pattern[at];
			if (character === "\\") {
				at += 1;
				continue;
			}
			if (inClass) {
				if (character === "]") inClass = false;
				continue;
			}
			if (character === "[") inClass = true;
			else if (character === "(") open.push(at);
			else if (character === ")") {
				const opened = open.pop();
				if (opened === undefined) return new RejectedPattern("the pattern does not compile: unmatched ).");
				if (isQuantified(pattern, at + 1) && branchesOrRepeats(pattern.slice(opened + 1, at))) {
					return new RejectedPattern("a repeated group may not itself repeat or branch: this backtracks forever.");
				}
			}
		}
		return undefined;
	}
}

function isQuantified(pattern: string, at: number): boolean {
	const next = pattern[at];
	return next === "*" || next === "+" || (next === "{" && /^\{\d+(,\d*)?\}/.test(pattern.slice(at)));
}

function branchesOrRepeats(group: string): boolean {
	const body = group.replace(/^\?:/, "").replace(/^\?<[A-Za-z_$][\w$]*>/, "");
	let inClass = false;
	for (let at = 0; at < body.length; at += 1) {
		const character = body[at];
		if (character === "\\") {
			at += 1;
			continue;
		}
		if (inClass) {
			if (character === "]") inClass = false;
			continue;
		}
		if (character === "[") inClass = true;
		else if (character === "|" || character === "*" || character === "+" || character === "?") return true;
		else if (character === "{" && /^\{\d+(,\d*)?\}/.test(body.slice(at))) return true;
	}
	return false;
}
