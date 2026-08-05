import { AdkError } from "../../../../common/errors/adk.error";

/**
 * The adapter was asked for something it declared it does not do.
 * Refusing is the honest answer: accepting the write and dropping it would let a caller
 * believe something is stored that nothing will ever read back.
 */
export class UnsupportedStorageFeatureError extends AdkError {
	public readonly code = "UNSUPPORTED_STORAGE_FEATURE";

	public constructor(public readonly feature: string) {
		super(`This storage adapter does not support ${feature}; its capabilities say so.`);
	}
}
