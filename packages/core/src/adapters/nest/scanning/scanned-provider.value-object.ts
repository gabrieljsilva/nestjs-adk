/**
 * One provider NestJS already built, as the scanner needs it.
 * The type is what carries the decorator metadata and the instance is what answers, so
 * both travel together and neither is looked up again.
 *
 * The two are not always the same class. A provider the module registered under one class
 * and served with another declares itself through the first and answers through the second,
 * which is exactly what a test substituting a tool asks for.
 */
export class ScannedProvider {
	public constructor(
		public readonly name: string,
		public readonly type: object,
		public readonly instance: object,
	) {}
}
