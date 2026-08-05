/** Where the runtime stands: taking commands, finishing what it has, or done. */
export class RuntimeState {
	public static readonly ACTIVE = new RuntimeState("active");
	public static readonly DRAINING = new RuntimeState("draining");
	public static readonly STOPPED = new RuntimeState("stopped");

	private constructor(public readonly name: string) {}

	public get acceptsCommands(): boolean {
		return this === RuntimeState.ACTIVE;
	}

	public equals(other: RuntimeState): boolean {
		return this.name === other.name;
	}

	public toString(): string {
		return this.name;
	}
}
