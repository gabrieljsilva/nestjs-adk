/**
 * What a tool does to the world, ordered: read, then write, then destructive.
 *
 * It is a fact about the tool, declared by whoever wrote it, and never a decision about
 * what to do with that fact. Whether an effect needs a human to agree first is the
 * approval policy's business, and the same tool can need approval in one application and
 * not in another without either of them lying about what it does.
 */
export class ToolEffect {
	public static readonly READ = new ToolEffect("read", 0);
	public static readonly WRITE = new ToolEffect("write", 1);
	public static readonly DESTRUCTIVE = new ToolEffect("destructive", 2);

	private constructor(
		public readonly name: string,
		private readonly severity: number,
	) {}

	public static of(name: string): ToolEffect | undefined {
		return [ToolEffect.READ, ToolEffect.WRITE, ToolEffect.DESTRUCTIVE].find((effect) => effect.name === name);
	}

	public isAtLeast(other: ToolEffect): boolean {
		return this.severity >= other.severity;
	}

	public equals(other: ToolEffect): boolean {
		return this.name === other.name;
	}

	public toString(): string {
		return this.name;
	}
}
