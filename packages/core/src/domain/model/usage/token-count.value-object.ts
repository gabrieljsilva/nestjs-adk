/**
 * A number of tokens, always measured.
 * There is no estimated variant: an estimate looks exactly like a measurement at the call
 * site, so everything deciding on top of it would inherit an error nobody can see.
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
