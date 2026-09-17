import { MissingActorIdError } from "../errors/missing-actor-id.error";

/**
 * Who a tool runs on behalf of.
 *
 * The runtime knows one thing about an actor, the `id`, and carries the rest as `claims` it never
 * reads: which workspace, which role, which OAuth scopes are the application's vocabulary, and an
 * access policy written by the application is what interprets them. The same value reaches a tool
 * whether an agent asked for it or an MCP client did, which is what lets one authorization rule
 * cover both doors.
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
