export interface McpToolAnnotations {
	readOnlyHint?: boolean;
	destructiveHint?: boolean;
}

export function readEffectName(annotations: McpToolAnnotations | undefined): string {
	if (annotations?.readOnlyHint === true) return "read";
	if (annotations?.destructiveHint === false) return "write";
	return "destructive";
}
