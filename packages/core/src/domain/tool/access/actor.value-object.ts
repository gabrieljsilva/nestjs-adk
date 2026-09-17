import { MissingActorIdError } from "../errors/missing-actor-id.error";

/**
 * Who a tool runs on behalf of: an `id` the runtime compares by, and `claims` it never reads.
 * An access policy written by the application is what interprets the claims.
 */
export class Actor<TClaims extends Record<string, unknown> = Record<string, unknown>> {
	private constructor(
		public readonly id: string,
		public readonly claims: Readonly<TClaims>,
	) {
		Object.freeze(this);
	}

	public static fromId(id: string): Actor;
	public static fromId<TClaims extends Record<string, unknown>>(id: string, claims: TClaims): Actor<TClaims>;
	public static fromId(id: string, claims: Record<string, unknown> = {}): Actor<Record<string, unknown>> {
		const trimmed = id.trim();
		if (trimmed.length === 0) throw new MissingActorIdError();
		return new Actor(trimmed, Object.freeze({ ...claims }));
	}

	public equals(other: Actor): boolean {
		return this.id === other.id;
	}

	public toString(): string {
		return this.id;
	}
}
