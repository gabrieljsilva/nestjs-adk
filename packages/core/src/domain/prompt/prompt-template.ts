import { MissingPromptVariablesError } from "./errors/missing-prompt-variables.error";

/**
 * Both forms in one pass, with the required one first.
 *
 * The order inside the alternation is the whole reason this is a single expression. Matching
 * `{{name}}` first against `{{{name}}}` consumes the inner braces and leaves `{<value>}`
 * behind, which is a required variable silently rendered as an optional one wrapped in
 * punctuation. Trying the three brace form at every position first cannot do that.
 */
const PLACEHOLDER = /\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g;

/**
 * Text with holes in it, and the rule for what may be left empty.
 *
 * `{{name}}` is optional: nothing for it renders as nothing, because a prompt that mentions
 * a customer's plan when there is no plan reads worse than one that does not mention it.
 * `{{{name}}}` is required, and a run that cannot fill it fails instead of asking a model
 * to act on a sentence with a gap in it.
 *
 * Values are rendered with `String`, so a prompt is text about text. Handing it an object
 * produces `[object Object]`, which is the caller formatting the value in the wrong place
 * rather than something to be guessed at here.
 *
 * `null` and `undefined` both count as absent. That is deliberate: the value usually comes
 * from a lookup, and a repository that answers `null` for a column nobody filled is saying
 * the same thing as a key that was never passed.
 */
export class PromptTemplate {
	private constructor(
		private readonly text: string,
		private readonly name?: string,
	) {}

	/** The name is only ever used to say which template failed, so an inline string needs none. */
	public static of(text: string, name?: string): PromptTemplate {
		return new PromptTemplate(text, name);
	}

	public render(vars: Record<string, unknown> = {}): string {
		const missing = new Set<string>();
		const rendered = this.text.replace(PLACEHOLDER, (_match, required?: string, optional?: string) => {
			const key = required ?? optional;
			if (key === undefined) return "";
			const value = vars[key];
			if (value === undefined || value === null) {
				if (required !== undefined) missing.add(required);
				return "";
			}
			return String(value);
		});
		// Every hole is walked before anything throws, so one failure names all of them.
		if (missing.size > 0) throw new MissingPromptVariablesError([...missing], this.name);
		return rendered;
	}
}
