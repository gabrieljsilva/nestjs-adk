/**
 * Spec constructor whose options are narrowed by the model name literal, per the map.
 * Models outside the map keep the full options of the spec class.
 */
export type TypedModelSpec<O, I, Map> = new <M extends string>(
	model: M,
	options?: M extends keyof Map ? Map[M] : O,
) => I;

/**
 * Restricts, at type level only, which options each model name accepts.
 *
 * ```ts
 * const MyGemini = createModelSpec(GeminiModel)<{
 *   "gemini-2.5-flash-lite": Omit<GeminiOptions, "temperature">;
 * }>();
 *
 * new MyGemini("gemini-2.5-flash-lite", { temperature: 0.2 }); // compile error
 * new MyGemini("gemini-2.5-pro", { temperature: 0.2 }); // fine, outside the map
 * ```
 *
 * Which model supports what is the application's knowledge, not the lib's: providers
 * change it release by release, and a table shipped here would be wrong by the time it
 * is read.
 *
 * This is a free function because it has no behavior to own. It returns the very
 * constructor it was given; everything it does happens in the type checker, and the
 * overload is what lets it do so without asserting.
 */
export function createModelSpec<O extends object, I extends object>(
	spec: new (model: string, options?: O) => I,
): <Map extends Partial<Record<string, O>>>() => TypedModelSpec<O, I, Map>;
export function createModelSpec(spec: unknown) {
	return () => spec;
}
