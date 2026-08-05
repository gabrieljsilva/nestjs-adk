export class EscapesTheTypeSystem {
	public loose(value: any): string {
		return String(value);
	}

	public asserted(value: unknown): string {
		return value as string;
	}

	public nonNull(value: string | undefined): number {
		return value!.length;
	}
}
