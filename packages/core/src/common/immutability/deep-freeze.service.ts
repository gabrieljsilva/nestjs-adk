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
