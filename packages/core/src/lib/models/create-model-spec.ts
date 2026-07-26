/** Spec constructor whose options are narrowed by the model-name literal, per the Map. */
export type TypedModelSpec<O, I, Map> = new <M extends string>(
	model: M,
	options?: M extends keyof Map ? Map[M] : O,
) => I;

/**
 * Type-only restriction of spec options per model name — zero runtime behavior.
 * Models outside the map keep the full options of the spec class. The map is
 * the app's responsibility (the lib does not track per-model capabilities).
 *
 * const MyGemini = createModelSpec(Gemini)<{
 *   "gemini-2.5-flash-lite": Omit<GeminiOptions, "temperature">;
 * }>();
 * new MyGemini("gemini-2.5-flash-lite", { temperature: 0.2 }); // compile error
 */
export function createModelSpec<O extends object, I extends object>(spec: new (model: string, options?: O) => I) {
	return <Map extends Partial<Record<string, O>>>(): TypedModelSpec<O, I, Map> =>
		spec as unknown as TypedModelSpec<O, I, Map>;
}
