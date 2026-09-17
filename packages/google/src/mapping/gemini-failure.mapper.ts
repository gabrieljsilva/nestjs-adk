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

const SAFETY_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"]);
const CONTEXT_HINTS = ["exceeds the maximum number of tokens", "input token count", "context length"];

/**
 * Classifies a raw Gemini error into the failure a policy can decide on.
 *
 * Status first, message only where the status cannot tell two cases apart: a 400 is
 * both a malformed request and a context overflow, and only the text distinguishes
 * them. Anything unrecognised stays unknown, and unknown is not transient, so a wrong
 * guess never turns a permanent error into an endless reroute.
 */
export class GeminiFailureMapper {
	public toFailure(error: unknown): ModelFailure {
		const message = this.readMessage(error);
		const status = this.readStatus(error);

		if (this.isSafety(error, message)) return new SafetyBlockedFailure(message, error);
		if (status === 429 || this.mentions(message, "RESOURCE_EXHAUSTED"))
			return new RateLimitedFailure(message, error, this.readRetryAfter(error));
		if (status === 400 && this.isContextOverflow(message)) return new ContextExceededFailure(message, error);
		if (status === 408 || status === 504 || this.isTimeout(error, message)) return new TimeoutFailure(message, error);
		if (status !== undefined && status >= 500) return new UnavailableFailure(message, error, this.readRetryAfter(error));
		if (status === undefined && this.isConnection(error, message)) return new UnavailableFailure(message, error);
		if (this.isClientError(status)) return new InvalidRequestFailure(message, error);
		return new UnknownFailure(message, error);
	}

	/**
	 * A 4xx that is not one of the cases above is the request itself being refused.
	 *
	 * This is where a thinking budget the model does not take, a field it does not know
	 * and an unsigned function call all land: `INVALID_ARGUMENT` and `PERMISSION_DENIED`
	 * describe what was sent, and the next model in a chain is sent the same thing.
	 */
	private isClientError(status: number | undefined): boolean {
		return status !== undefined && status >= 400 && status < 500;
	}

	private isSafety(error: unknown, message: string): boolean {
		const reason = this.textAt(error, "finishReason") ?? this.textAt(error, "blockReason");
		if (reason !== undefined && SAFETY_REASONS.has(reason)) return true;
		return this.mentions(message, "SAFETY") || this.mentions(message, "PROHIBITED_CONTENT");
	}

	private isContextOverflow(message: string): boolean {
		const lowered = message.toLowerCase();
		return CONTEXT_HINTS.some((hint) => lowered.includes(hint));
	}

	private isTimeout(error: unknown, message: string): boolean {
		if (this.readCode(error) === "ETIMEDOUT") return true;
		return this.mentions(message, "DEADLINE_EXCEEDED") || this.mentions(message, "timeout");
	}

	/** No status at all means the request never reached the provider. */
	private isConnection(error: unknown, message: string): boolean {
		const code = this.readCode(error);
		if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") return true;
		return this.mentions(message, "fetch failed") || this.mentions(message, "socket hang up");
	}

	private mentions(message: string, text: string): boolean {
		return message.toLowerCase().includes(text.toLowerCase());
	}

	private readStatus(error: unknown): number | undefined {
		const direct = this.numberAt(error, "status");
		if (direct !== undefined) return direct;
		const code = this.numberAt(error, "code");
		if (code !== undefined) return code;
		if (typeof error !== "object" || error === null) return undefined;
		return this.numberAt(Reflect.get(error, "error"), "code");
	}

	private readMessage(error: unknown): string {
		if (error instanceof Error) return error.message;
		if (typeof error === "string") return error;
		const nested = this.textAt(error, "message");
		return nested ?? "Gemini failed without a message";
	}

	private readCode(error: unknown): string | undefined {
		return this.textAt(error, "code");
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

	/**
	 * What `Retry-After` said, in whichever of its two forms the provider used.
	 *
	 * RFC 9110 allows a count of seconds or an HTTP date, and providers send both. A date is
	 * turned into what is left of it now, so whoever waits is handed one kind of number. A
	 * header that is neither is dropped rather than guessed: a wrong wait is worse than none,
	 * since the policy has a backoff of its own to fall back on.
	 */
	private readRetryAfter(error: unknown): Duration | undefined {
		const raw = this.readHeader(error, "retry-after");
		if (raw === undefined) return undefined;
		const seconds = Number(raw);
		if (Number.isFinite(seconds) && seconds >= 0) return Duration.fromSeconds(seconds);
		const at = Date.parse(raw);
		if (Number.isNaN(at)) return undefined;
		return Duration.fromMillis(Math.max(0, at - Date.now()));
	}

	/** The SDKs expose headers as a `Headers` instance, a plain record, or not at all. */
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
