/** Long enough for a real pattern, short enough that nobody hides a state machine in one. */
const MAX_PATTERN_CHARACTERS = 200;

/** Above this, a bounded repetition is a loop somebody wrote in the argument of a tool call. */
const MAX_REPETITION = 100;

/** Why a pattern was refused, in a sentence written for the model that wrote it. */
export class RejectedPattern {
	public constructor(public readonly reason: string) {}
}

/**
 * The one place a pattern written by a model becomes a `RegExp`, and the rules it has to
 * pass first.
 *
 * A regular expression is the only argument of the exploration tools that is code. Node's
 * engine backtracks, so a pattern whose quantifiers nest can take exponential time on
 * input that merely fails to match, and the input here is an artifact the model already
 * knows is large. Nothing about a timeout would help: the loop runs inside one call and
 * there is no thread to interrupt it from.
 *
 * So the guard is structural and it is conservative. It refuses shapes that are known to
 * backtrack rather than trying to decide whether a particular one does, and the cost of
 * that is a pattern somebody could have written safely being turned down, which costs a
 * sentence back to the model. The default search is a fixed string precisely so that this
 * is the exception.
 *
 * The rules, each with the shape it exists for:
 *
 * - at most 200 characters, because every rule below is a scan and none of them is a proof;
 * - no quantifier on a group that itself contains a quantifier or an alternation: `(a+)+`,
 *   `(a*)*`, `(a?)+`, `([a-z]+)*`, `(a|a)+`, the classic exponential families;
 * - no backreference, `\\1`, which makes matching NP-hard on its own;
 * - no lookaround, `(?=`, `(?!`, `(?<=`, `(?<!`, which multiplies the paths through the
 *   pattern for no gain a search over an artifact needs;
 * - no repetition bound over 100, so `a{5000}` is refused before it is expanded;
 * - it has to compile, and a pattern that does not is the model's mistake to hear about.
 *
 * Flags are never the model's to choose. What comes back is global and nothing else, so a
 * pattern cannot turn on `s` and make `.` cross the whole artifact in one step.
 */
export class RegexGuard {
	public static readonly MAX_PATTERN_CHARACTERS = MAX_PATTERN_CHARACTERS;
	public static readonly MAX_REPETITION = MAX_REPETITION;

	/** The compiled pattern, or the reason it was refused. Nothing here throws. */
	public build(pattern: string): RegExp | RejectedPattern {
		const rejected = this.reject(pattern);
		if (rejected !== undefined) return rejected;
		try {
			return new RegExp(pattern, "g");
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

	/**
	 * A quantifier applied to a group that already repeats or branches, which is the shape
	 * every exponential pattern has.
	 *
	 * The scan walks the pattern once, keeps where each group opened and what it contained,
	 * and looks at what follows the parenthesis that closes it. Escaped parentheses and
	 * anything inside a character class are not structure and are skipped.
	 */
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

/** Whether what follows a closing parenthesis repeats it. */
function isQuantified(pattern: string, at: number): boolean {
	const next = pattern[at];
	return next === "*" || next === "+" || (next === "{" && /^\{\d+(,\d*)?\}/.test(pattern.slice(at)));
}

/**
 * Whether a group's body has a quantifier or an alternation in it, outside a character class.
 *
 * The `?:` of a non capturing group and the name of a named one are what the group is, not
 * what it holds, so they come off before the body is read.
 */
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
