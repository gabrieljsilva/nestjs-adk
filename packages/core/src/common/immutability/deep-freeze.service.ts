/**
 * Freezes an object and everything reachable from it.
 *
 * The prepared context uses it so compaction can never be implemented as a mutation:
 * a strategy that tries to edit the projection in place fails loudly instead of
 * changing what a previous call already measured.
 */
export class DeepFreeze {
	public static apply<T>(value: T): T {
		if (value === null || typeof value !== "object") return value;
		if (Object.isFrozen(value)) return value;
		Object.freeze(value);
		for (const key of Reflect.ownKeys(value)) {
			DeepFreeze.apply(Reflect.get(value, key));
		}
		return value;
	}
}
