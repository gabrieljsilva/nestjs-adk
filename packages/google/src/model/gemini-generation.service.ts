export function signsFunctionCalls(model: string): boolean {
	const generation = /(?:^|\/)gemini-(\d+)/.exec(model)?.[1];
	return generation === undefined || Number(generation) >= 3;
}
