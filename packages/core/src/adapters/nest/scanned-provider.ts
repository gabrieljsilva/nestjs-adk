/**
 * One provider NestJS already built, as the scanner needs it.
 * The type is what carries the decorator metadata and the instance is what answers, so
 * both travel together and neither is looked up again.
 */
export class ScannedProvider {
	public constructor(
		public readonly name: string,
		public readonly type: object,
		public readonly instance: object,
	) {}
}
