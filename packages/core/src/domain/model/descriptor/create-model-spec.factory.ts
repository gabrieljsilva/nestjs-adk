/**
 * Spec constructor whose options are narrowed by the model name literal, per the map.
 * Models outside the map keep the full options of the spec class.
 */
export type TypedModelSpec<O, I, Map> = new <M extends string>(
	model: M,
	options?: M extends keyof Map ? Map[M] : O,
) => I;

/**
 * Restricts, at type level only, which options each model name accepts. Which model supports
 * what is the application's knowledge: providers change it release by release. A name outside
 * the map keeps the provider's own options.
 */
export function createModelSpec<O extends object, I extends object>(
	spec: new (model: string, options?: O) => I,
): <Map extends Partial<Record<string, O>>>() => TypedModelSpec<O, I, Map>;
export function createModelSpec(spec: unknown) {
	return () => spec;
}
