import { MissingPromptVariablesError } from "./errors/missing-prompt-variables.error";

// The required form comes first: `{{name}}` matched against `{{{name}}}` eats the inner braces.
const PLACEHOLDER = /\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g;

/**
 * Text with holes in it. `{{name}}` is optional and renders as nothing when unfilled;
 * `{{{name}}}` is required and raises {@link MissingPromptVariablesError}.
 *
 * `null` and `undefined` both count as absent. Values are rendered with `String`.
 */
export class PromptTemplate {
	public constructor(
		private readonly text: string,
		private readonly name?: string,
	) {}

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
		if (missing.size > 0) throw new MissingPromptVariablesError([...missing], this.name);
		return rendered;
	}
}
