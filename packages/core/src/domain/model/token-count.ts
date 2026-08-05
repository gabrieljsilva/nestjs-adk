/**
 * A number of tokens, always measured.
 *
 * There is no estimated variant, and that is a decision rather than an omission: an
 * estimate looks exactly like a measurement at the call site, so everything deciding on
 * top of it inherits an error nobody can see. Providers count tokens after the fact, so
 * the honest number arrives with the usage of a call that already happened. What can be
 * known before a call is the composition of the prompt, expressed as shares, never as a
 * count.
 */
export class TokenCount {
	private constructor(public readonly tokens: number) {}

	public static measured(tokens: number): TokenCount {
		return new TokenCount(Math.max(0, Math.trunc(tokens)));
	}

	public plus(other: TokenCount): TokenCount {
		return new TokenCount(this.tokens + other.tokens);
	}
}
