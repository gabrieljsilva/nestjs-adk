/** Which provider and which model answered, for logs, pricing and diagnostics. */
export class ModelIdentity {
	public readonly provider: string;
	public readonly model: string;

	public constructor(provider: string, model: string) {
		this.provider = provider.trim();
		this.model = model.trim();
	}

	public equals(other: ModelIdentity): boolean {
		return this.provider === other.provider && this.model === other.model;
	}

	public toString(): string {
		return `${this.provider}/${this.model}`;
	}
}
