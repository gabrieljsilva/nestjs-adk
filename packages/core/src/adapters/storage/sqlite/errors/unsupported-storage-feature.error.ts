import { AdkError } from "../../../../common/errors/adk.error";

export class UnsupportedStorageFeatureError extends AdkError {
	public readonly code = "UNSUPPORTED_STORAGE_FEATURE";

	public constructor(public readonly feature: string) {
		super(`This storage adapter does not support ${feature}; its capabilities say so.`);
	}
}
