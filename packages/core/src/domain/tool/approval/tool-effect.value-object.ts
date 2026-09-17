/**
 * What a tool does to the world, ordered: read, then write, then destructive.
 * It is a fact the tool declares, never a decision about it; whether an effect needs approval
 * is the approval policy's answer.
 */
export class ToolEffect {
	public static readonly READ = new ToolEffect("read", 0);
	public static readonly WRITE = new ToolEffect("write", 1);
	public static readonly DESTRUCTIVE = new ToolEffect("destructive", 2);

	private constructor(
		public readonly name: string,
		private readonly severity: number,
	) {}

	public static fromName(name: string): ToolEffect | undefined {
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
