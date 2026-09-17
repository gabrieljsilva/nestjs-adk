import {
	ContextExceededFailure,
	Duration,
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

export class OpenAiFailureMapper {
	public toFailure(error: unknown): ModelFailure {
		const message = this.readMessage(error);
		const status = this.numberAt(error, "status");
		const code = this.textAt(error, "code");
		const type = this.textAt(error, "type");

		if (code !== undefined && CONTEXT_CODES.has(code)) return new ContextExceededFailure(message, error);
		if (code !== undefined && SAFETY_CODES.has(code)) return new SafetyBlockedFailure(message, error);
		if (type !== undefined && SAFETY_CODES.has(type)) return new SafetyBlockedFailure(message, error);
		if (status === 429) return new RateLimitedFailure(message, error, this.readRetryAfter(error));
		if (status === 408 || this.isTimeout(error, code)) return new TimeoutFailure(message, error);
		if (status !== undefined && status >= 500) return new UnavailableFailure(message, error, this.readRetryAfter(error));
		if (status === undefined && this.isConnection(error, code)) return new UnavailableFailure(message, error);
		if (this.isClientError(status)) return new InvalidRequestFailure(message, error);
		return new UnknownFailure(message, error);
	}

	private isClientError(status: number | undefined): boolean {
		return status !== undefined && status >= 400 && status < 500;
	}

	private isTimeout(error: unknown, code: string | undefined): boolean {
		if (code === "ETIMEDOUT" || code === "ECONNABORTED") return true;
		return this.readName(error).includes("Timeout");
	}

	private isConnection(error: unknown, code: string | undefined): boolean {
		if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") return true;
		return this.readName(error).includes("Connection");
	}

	private readName(error: unknown): string {
		if (error instanceof Error) return error.constructor.name;
		return "";
	}

	private readMessage(error: unknown): string {
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

	private readRetryAfter(error: unknown): Duration | undefined {
		const raw = this.readHeader(error, "retry-after");
		if (raw === undefined) return undefined;
		const seconds = Number(raw);
		if (Number.isFinite(seconds) && seconds >= 0) return Duration.fromSeconds(seconds);
		const at = Date.parse(raw);
		if (Number.isNaN(at)) return undefined;
		return Duration.fromMillis(Math.max(0, at - Date.now()));
	}

	private readHeader(error: unknown, name: string): string | undefined {
		if (typeof error !== "object" || error === null) return undefined;
		const headers: unknown =
			Reflect.get(error, "headers") ?? Reflect.get(Object(Reflect.get(error, "response")), "headers");
		if (typeof headers !== "object" || headers === null) return undefined;
		const get: unknown = Reflect.get(headers, "get");
		if (typeof get === "function") {
			const value: unknown = Reflect.apply(get, headers, [name]);
			return typeof value === "string" ? value : undefined;
		}
		const direct = Reflect.get(headers, name) ?? Reflect.get(headers, name.toLowerCase());
		return typeof direct === "string" ? direct : undefined;
	}
}
