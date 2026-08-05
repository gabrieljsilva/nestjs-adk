/** Which provider and which model answered, for logs, pricing and diagnostics. */
export class ModelIdentity {
	private constructor(
		public readonly provider: string,
		public readonly model: string,
	) {}

	public static of(provider: string, model: string): ModelIdentity {
		return new ModelIdentity(provider.trim(), model.trim());
	}

	public equals(other: ModelIdentity): boolean {
		return this.provider === other.provider && this.model === other.model;
	}

	public toString(): string {
		return `${this.provider}/${this.model}`;
	}
}
