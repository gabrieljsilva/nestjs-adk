import {
	ContextExceededFailure,
	InvalidRequestFailure,
	type ModelFailure,
	RateLimitedFailure,
	SafetyBlockedFailure,
	TimeoutFailure,
	UnavailableFailure,
	UnknownFailure,
} from "@nestjs-adk/core";

const CONTEXT_CODES = new Set(["context_length_exceeded", "string_above_max_length"]);
const SAFETY_CODES = new Set(["content_filter", "content_policy_violation"]);

/**
 * Classifies a raw provider error into the failure a policy can decide on.
 *
 * It reads the shape the OpenAI SDK produces (`status`, `code`, `type`) rather than
 * matching messages, which differ between OpenAI and every gateway that imitates it.
 * Anything it does not recognise stays unknown, and unknown is not transient: guessing
 * a permanent error into a retryable one is how a failover turns into a loop.
 *
 * A 4xx that is none of the recognised cases is the caller being told the request is
 * wrong, which is worth saying: left as unknown it reads like the provider had a bad
 * day, and every model in a failover chain gets sent the same rejected request.
 */
export class OpenAiFailureMapper {
	public toFailure(error: unknown): ModelFailure {
		const message = this.messageOf(error);
		const status = this.numberAt(error, "status");
		const code = this.textAt(error, "code");
		const type = this.textAt(error, "type");

		if (code !== undefined && CONTEXT_CODES.has(code)) return new ContextExceededFailure(message, error);
		if (code !== undefined && SAFETY_CODES.has(code)) return new SafetyBlockedFailure(message, error);
		if (type !== undefined && SAFETY_CODES.has(type)) return new SafetyBlockedFailure(message, error);
		if (status === 429) return new RateLimitedFailure(message, error);
		if (status === 408 || this.isTimeout(error, code)) return new TimeoutFailure(message, error);
		if (status !== undefined && status >= 500) return new UnavailableFailure(message, error);
		if (status === undefined && this.isConnection(error, code)) return new UnavailableFailure(message, error);
		if (this.isClientError(status)) return new InvalidRequestFailure(message, error);
		return new UnknownFailure(message, error);
	}

	/**
	 * Anything else the provider answered in the 4xx range is about the request.
	 *
	 * The cases worth telling apart already returned above, so what reaches here is a
	 * schema it will not take, a field this model does not support, a key it does not
	 * accept or a model that does not exist: all of them things the caller sent.
	 */
	private isClientError(status: number | undefined): boolean {
		return status !== undefined && status >= 400 && status < 500;
	}

	private isTimeout(error: unknown, code: string | undefined): boolean {
		if (code === "ETIMEDOUT" || code === "ECONNABORTED") return true;
		return this.nameOf(error).includes("Timeout");
	}

	/** No status at all means the request never reached the provider. */
	private isConnection(error: unknown, code: string | undefined): boolean {
		if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") return true;
		return this.nameOf(error).includes("Connection");
	}

	private nameOf(error: unknown): string {
		if (error instanceof Error) return error.constructor.name;
		return "";
	}

	private messageOf(error: unknown): string {
		if (error instanceof Error) return error.message;
		if (typeof error === "string") return error;
		return "the provider failed without a message";
	}

	private textAt(error: unknown, key: string): string | undefined {
		if (typeof error !== "object" || error === null) return undefined;
		const value = Reflect.get(error, key);
		return typeof value === "string" ? value : undefined;
	}

	private numberAt(error: unknown, key: string): number | undefined {
		if (typeof error !== "object" || error === null) return undefined;
		const value = Reflect.get(error, key);
		return typeof value === "number" ? value : undefined;
	}
}
