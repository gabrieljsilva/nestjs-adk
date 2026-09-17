/**
 * Every shape a metadata value may take: JSON, and nothing else.
 * Anything that does not survive `JSON.stringify` unchanged reads back meaning something else.
 */
export type MetadataValue =
	| string
	| number
	| boolean
	| null
	| readonly MetadataValue[]
	| { readonly [key: string]: MetadataValue };
