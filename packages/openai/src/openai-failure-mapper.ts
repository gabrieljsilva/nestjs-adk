import {
	ContextExceededFailure,
	type ModelFailure,
	RateLimitedFailure,
	SafetyBlockedFailure,
	TimeoutFailure,
	UnavailableFailure,
	UnknownFailure,
} from "@nestjs-adk/core/native";

const CONTEXT_CODES = new Set(["context_length_exceeded", "string_above_max_length"]);
const SAFETY_CODES = new Set(["content_filter", "content_policy_violation"]);

/**
 * Classifies a raw provider error into the failure a policy can decide on.
 *
 * It reads the shape the OpenAI SDK produces (`status`, `code`, `type`) rather than
 * matching messages, which differ between OpenAI and every gateway that imitates it.
 * Anything it does not recognise stays unknown, and unknown is not transient: guessing
 * a permanent error into a retryable one is how a failover turns into a loop.
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
		return new UnknownFailure(message, error);
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
