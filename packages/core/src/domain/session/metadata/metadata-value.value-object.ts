/**
 * Every shape a metadata value may take: JSON, and nothing else.
 *
 * Metadata is written to the journal and read back by whoever holds the row, which may be a
 * different process, a different build or a database console. Anything that does not survive
 * `JSON.stringify` unchanged would come back meaning something else, so the type says so
 * rather than leaving it to a runtime check nobody reads.
 */
export type MetadataValue =
	| string
	| number
	| boolean
	| null
	| readonly MetadataValue[]
	| { readonly [key: string]: MetadataValue };
