export class StateValues {
	private readonly values: ReadonlyMap<string, string>;

	private constructor(values: ReadonlyMap<string, string>) {
		this.values = values;
	}

	public static empty(): StateValues {
		return new StateValues(new Map());
	}

	public static fromEntries(entries: ReadonlyArray<readonly [string, string]>): StateValues {
		return new StateValues(new Map(entries));
	}

	public with(key: string, value: string): StateValues {
		const next = new Map(this.values);
		next.set(key, value);
		return new StateValues(next);
	}

	public without(key: string): StateValues {
		const next = new Map(this.values);
		next.delete(key);
		return new StateValues(next);
	}

	public find(key: string): string | undefined {
		return this.values.get(key);
	}

	public get size(): number {
		return this.values.size;
	}

	public entries(): ReadonlyArray<readonly [string, string]> {
		return [...this.values.entries()].sort((left, right) => left[0].localeCompare(right[0]));
	}
}
