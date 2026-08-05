import { BaseLlm, type BaseLlmConnection, type LlmRequest, type LlmResponse } from "@google/adk";
import { type FailoverFn, ModelsExhaustedError, failoverPolicy } from "@nestjs-adk/core";
import { FailoverLlm, type FailoverReroute, httpStatusOf } from "./failover-llm";

class RecordingLlm extends BaseLlm {
	public lastRequest?: LlmRequest;
	public calls = 0;

	public constructor(
		model: string,
		private readonly behavior: { failWith?: Error; failAfterChunks?: number; chunks?: string[] } = {},
	) {
		super({ model });
	}

	public async *generateContentAsync(llmRequest: LlmRequest): AsyncGenerator<LlmResponse, void> {
		this.calls += 1;
		this.lastRequest = llmRequest;
		if (this.behavior.failWith && this.behavior.failAfterChunks === undefined) throw this.behavior.failWith;
		let emitted = 0;
		for (const text of this.behavior.chunks ?? ["ok"]) {
			yield { content: { role: "model", parts: [{ text }] } };
			emitted += 1;
			if (this.behavior.failAfterChunks !== undefined && emitted >= this.behavior.failAfterChunks) {
				throw this.behavior.failWith ?? new Error("mid-stream failure");
			}
		}
	}

	public connect(llmRequest: LlmRequest): Promise<BaseLlmConnection> {
		this.lastRequest = llmRequest;
		return Promise.resolve("connected" as unknown as BaseLlmConnection);
	}
}

/** The agent's request arrives naming the PRIMARY (the chain's public id), never a display name. */
function incomingRequest(): LlmRequest {
	return { contents: [], config: {}, liveConnectConfig: {}, toolsDict: {}, model: "primary-id" };
}

/** Wires targets by name: the engine's resolveTarget reduced to a lookup table. */
function chain(
	primary: RecordingLlm,
	targets: Record<string, RecordingLlm>,
	policy: FailoverFn,
	onReroute?: (reroute: FailoverReroute) => void,
): FailoverLlm {
	return new FailoverLlm({
		primary,
		policy,
		resolveTarget: async (target) => {
			const resolved = targets[target as string];
			if (!resolved) throw new Error(`unknown target ${String(target)}`);
			return resolved;
		},
		onReroute,
	});
}

async function drain(iterable: AsyncGenerator<LlmResponse, void>): Promise<LlmResponse[]> {
	const out: LlmResponse[] = [];
	for await (const item of iterable) out.push(item);
	return out;
}

describe("FailoverLlm: the lib's own failover, driven by the model's declared policy", () => {
	it("every attempt is asked for ITS model, and the incoming request is never mutated", async () => {
		const primary = new RecordingLlm("gemini-3.6-flash", { failWith: new Error("429") });
		const fallback = new RecordingLlm("gemini-3.5-flash");
		const request = incomingRequest();

		await drain(chain(primary, { next: fallback }, () => "next").generateContentAsync(request));

		expect(primary.lastRequest?.model).toBe("gemini-3.6-flash");
		expect(fallback.lastRequest?.model).toBe("gemini-3.5-flash");
		expect(request.model).toBe("primary-id");
	});

	it("the array form (via failoverPolicy) walks the list in order and reports each reroute", async () => {
		const reroutes: FailoverReroute[] = [];
		const primary = new RecordingLlm("a", { failWith: new Error("429 resource exhausted") });
		const second = new RecordingLlm("b", { failWith: new Error("503") });
		const third = new RecordingLlm("c", { chunks: ["saved"] });
		// biome-ignore lint/style/noNonNullAssertion: two entries in, a function out
		const policy = failoverPolicy(["b", "c"])!;

		const responses = await drain(
			chain(primary, { b: second, c: third }, policy, (reroute) => reroutes.push(reroute)).generateContentAsync(
				incomingRequest(),
			),
		);

		expect(responses[0]?.content?.parts?.[0]?.text).toBe("saved");
		expect(reroutes.map((reroute) => `${reroute.from}->${reroute.to}`)).toEqual(["a->b", "b->c"]);
	});

	it("the policy sees the current model and the PREVIOUS failures; the current error is the argument", async () => {
		const seen: Array<{ currentModel: string; prior: number }> = [];
		const primary = new RecordingLlm("a", { failWith: new Error("down") });
		const second = new RecordingLlm("b", { failWith: new Error("down too") });

		await drain(
			chain(primary, { b: second }, (_error, meta) => {
				seen.push({ currentModel: meta.currentModel, prior: meta.failures.length });
				return meta.failures.length === 0 ? "b" : undefined;
			}).generateContentAsync(incomingRequest()),
		).catch(() => undefined);

		expect(seen).toEqual([
			{ currentModel: "a", prior: 0 },
			{ currentModel: "b", prior: 1 },
		]);
	});

	it("returning undefined gives up: ModelsExhaustedError carries every failure in order", async () => {
		const primary = new RecordingLlm("a", { failWith: new Error("down") });

		const attempt = drain(chain(primary, {}, () => undefined).generateContentAsync(incomingRequest()));

		await expect(attempt).rejects.toBeInstanceOf(ModelsExhaustedError);
		await attempt.catch((error: ModelsExhaustedError) => {
			expect(error.failures.map((failure) => failure.target)).toEqual(["a"]);
		});
	});

	it("returning the same model is a retry: the ceiling stops a policy that never gives up", async () => {
		const primary = new RecordingLlm("a", { failWith: new Error("flaky") });

		const attempt = drain(chain(primary, { a: primary }, () => "a").generateContentAsync(incomingRequest()));

		await expect(attempt).rejects.toBeInstanceOf(ModelsExhaustedError);
		// The first call plus the retries the ceiling allowed, not an unbounded loop on the bill.
		expect(primary.calls).toBeGreaterThan(1);
		expect(primary.calls).toBeLessThanOrEqual(11);
	});

	it("a failure AFTER the first chunk never consults the policy: part of the answer already left", async () => {
		const policy = vi.fn();
		const primary = new RecordingLlm("a", { chunks: ["partial"], failAfterChunks: 1, failWith: new Error("cut") });

		await expect(drain(chain(primary, {}, policy).generateContentAsync(incomingRequest()))).rejects.toThrow("cut");
		expect(policy).not.toHaveBeenCalled();
	});

	it("a target the policy named but nobody can resolve fails the chain, carried in the failures", async () => {
		const primary = new RecordingLlm("a", { failWith: new Error("down") });

		const attempt = drain(chain(primary, {}, () => "ghost").generateContentAsync(incomingRequest()));

		await expect(attempt).rejects.toBeInstanceOf(ModelsExhaustedError);
		await attempt.catch((error: ModelsExhaustedError) => {
			expect(error.failures).toHaveLength(2);
		});
	});

	it("presents the primary's model id upstream, so logs and pricing see a real id", () => {
		const llm = chain(new RecordingLlm("gemini-3.6-flash"), {}, () => undefined);
		expect(llm.model).toBe("gemini-3.6-flash");
	});

	it("live connections go to the primary, with the request pinned to it", async () => {
		const primary = new RecordingLlm("gemini-3.6-flash");
		await chain(primary, {}, () => undefined).connect(incomingRequest());
		expect(primary.lastRequest?.model).toBe("gemini-3.6-flash");
	});
});

describe("httpStatusOf: best-effort status for failover policies", () => {
	it("reads the shapes the built-in specs' SDKs produce", () => {
		expect(httpStatusOf({ status: 429 })).toBe(429);
		expect(httpStatusOf({ response: { status: 503 } })).toBe(503);
		expect(httpStatusOf({ code: 500 })).toBe(500);
		expect(httpStatusOf(new Error("got status: 429 Too Many Requests"))).toBe(429);
	});

	it("answers undefined for shapes it does not know, so a policy can degrade with dignity", () => {
		expect(httpStatusOf(new Error("something odd"))).toBeUndefined();
		expect(httpStatusOf("string error")).toBeUndefined();
		expect(httpStatusOf({ status: 9000 })).toBeUndefined();
	});
});
