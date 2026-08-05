import {
	ContextExceededFailure,
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
		const message = this.messageOf(error);
		const status = this.statusOf(error);

		if (this.isSafety(error, message)) return new SafetyBlockedFailure(message, error);
		if (status === 429 || this.mentions(message, "RESOURCE_EXHAUSTED")) return new RateLimitedFailure(message, error);
		if (status === 400 && this.isContextOverflow(message)) return new ContextExceededFailure(message, error);
		if (status === 408 || status === 504 || this.isTimeout(error, message)) return new TimeoutFailure(message, error);
		if (status !== undefined && status >= 500) return new UnavailableFailure(message, error);
		if (status === undefined && this.isConnection(error, message)) return new UnavailableFailure(message, error);
		return new UnknownFailure(message, error);
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
		if (this.codeOf(error) === "ETIMEDOUT") return true;
		return this.mentions(message, "DEADLINE_EXCEEDED") || this.mentions(message, "timeout");
	}

	/** No status at all means the request never reached the provider. */
	private isConnection(error: unknown, message: string): boolean {
		const code = this.codeOf(error);
		if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") return true;
		return this.mentions(message, "fetch failed") || this.mentions(message, "socket hang up");
	}

	private mentions(message: string, text: string): boolean {
		return message.toLowerCase().includes(text.toLowerCase());
	}

	private statusOf(error: unknown): number | undefined {
		const direct = this.numberAt(error, "status");
		if (direct !== undefined) return direct;
		const code = this.numberAt(error, "code");
		if (code !== undefined) return code;
		if (typeof error !== "object" || error === null) return undefined;
		return this.numberAt(Reflect.get(error, "error"), "code");
	}

	private messageOf(error: unknown): string {
		if (error instanceof Error) return error.message;
		if (typeof error === "string") return error;
		const nested = this.textAt(error, "message");
		return nested ?? "Gemini failed without a message";
	}

	private codeOf(error: unknown): string | undefined {
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
}
