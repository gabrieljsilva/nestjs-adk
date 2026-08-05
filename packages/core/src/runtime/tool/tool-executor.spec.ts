import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodToolSchema } from "../../adapters/schema/zod-tool-schema";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AgentName } from "../../domain/agent/agent-name";
import { OffloadPolicy } from "../../domain/artifact/offload-policy";
import { RunLimits } from "../../domain/session/run-limits";
import { EffectApprovalPolicy } from "../../domain/tool/effect-approval-policy";
import { ToolApprovalRequiredError } from "../../domain/tool/errors/tool-approval-required.error";
import { ToolInvalidArgsError } from "../../domain/tool/errors/tool-invalid-args.error";
import { ToolRepeatedFailureError } from "../../domain/tool/errors/tool-repeated-failure.error";
import type { ToolContext } from "../../domain/tool/tool-context";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolInvocation } from "../../domain/tool/tool-invocation";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { ArtifactOffloader } from "../artifact/artifact-offloader";
import { ToolBreaker } from "./tool-breaker";
import { ToolCatalog } from "./tool-catalog";
import { ToolExecutionCommand } from "./tool-execution-command";
import { ToolExecutor } from "./tool-executor";

const SESSION = SessionId.from("s-1");
const RUN = AgentRunId.from("run-1");
const SUPPORT = AgentName.from("support");
const CALL = ToolCallId.from("c-1");

class RecordingHandler extends ToolHandler {
	public calls = 0;
	public lastContext?: ToolContext;

	public constructor(private readonly answer: unknown = { status: "ok" }) {
		super();
	}

	public async invoke(_args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		this.calls += 1;
		this.lastContext = context;
		return this.answer;
	}
}

class ThrowingHandler extends ToolHandler {
	public calls = 0;

	public async invoke(): Promise<unknown> {
		this.calls += 1;
		throw new Error("the payment gateway refused");
	}
}

function refundOf(handler: ToolHandler, effect: ToolEffect = ToolEffect.WRITE): ToolDefinition {
	const schema = ZodToolSchema.of(z.object({ orderId: z.string() }));
	return new ToolDefinition("refund", "Refunds an order", schema, effect, handler);
}

function commandOf(tool: ToolDefinition, args: unknown, approved = false): ToolExecutionCommand {
	return new ToolExecutionCommand(
		SESSION,
		RUN,
		SUPPORT,
		ToolCatalog.of([tool]),
		new ToolInvocation(CALL, tool.name, args),
		undefined,
		approved,
	);
}

function executorOf(approvals = EffectApprovalPolicy.never(), offload = OffloadPolicy.byDefault()): ToolExecutor {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	return new ToolExecutor(new ArtifactOffloader(storage, offload), approvals);
}

describe("ToolExecutor", () => {
	it("runs the tool and answers with what it produced", async () => {
		const handler = new RecordingHandler({ status: "refunded" });

		const outcome = await executorOf().execute(
			commandOf(refundOf(handler), { orderId: "42" }),
			new ToolBreaker(RunLimits.none()),
		);

		expect(handler.calls).toBe(1);
		expect(outcome.failed).toBe(false);
		expect(outcome.output).toEqual({ status: "refunded" });
		expect(outcome.contextOutput).toBe('{"status":"refunded"}');
	});

	it("hands the tool only the arguments its schema declared", async () => {
		const handler = new RecordingHandler();

		await executorOf().execute(
			commandOf(refundOf(handler), { orderId: "42", pleaseAlsoDelete: true }),
			new ToolBreaker(RunLimits.none()),
		);

		expect(handler.calls).toBe(1);
	});

	it("invokes the tool zero times when the arguments are invalid", async () => {
		const handler = new RecordingHandler();

		const outcome = await executorOf().execute(
			commandOf(refundOf(handler), { orderId: 42 }),
			new ToolBreaker(RunLimits.none()),
		);

		expect(handler.calls).toBe(0);
		expect(outcome.failed).toBe(true);
		expect(outcome.contextOutput.length).toBeGreaterThan(0);
	});

	it("ends the run once the model has written invalid arguments as often as it may", async () => {
		const executor = executorOf();
		const breaker = new ToolBreaker(RunLimits.none());
		const tool = refundOf(new RecordingHandler());

		await executor.execute(commandOf(tool, {}), breaker);

		await expect(executor.execute(commandOf(tool, {}), breaker)).rejects.toBeInstanceOf(ToolInvalidArgsError);
	});

	it("tells the model a tool failed instead of ending the run on the first failure", async () => {
		const handler = new ThrowingHandler();

		const outcome = await executorOf().execute(
			commandOf(refundOf(handler), { orderId: "42" }),
			new ToolBreaker(RunLimits.none()),
		);

		expect(outcome.failed).toBe(true);
		expect(outcome.contextOutput).toContain("the payment gateway refused");
	});

	it("ends the run when the same tool keeps failing", async () => {
		const executor = executorOf();
		const breaker = new ToolBreaker(RunLimits.of(undefined, 2));
		const tool = refundOf(new ThrowingHandler());

		await executor.execute(commandOf(tool, { orderId: "42" }), breaker);

		await expect(executor.execute(commandOf(tool, { orderId: "42" }), breaker)).rejects.toBeInstanceOf(
			ToolRepeatedFailureError,
		);
	});

	it("tells the model when it asked for a tool that does not exist", async () => {
		const command = new ToolExecutionCommand(
			SESSION,
			RUN,
			SUPPORT,
			ToolCatalog.of([refundOf(new RecordingHandler())]),
			new ToolInvocation(CALL, "refunds", { orderId: "42" }),
		);

		const outcome = await executorOf().execute(command, new ToolBreaker(RunLimits.none()));

		expect(outcome.failed).toBe(true);
		expect(outcome.contextOutput).toContain("refund");
	});

	it("stops before the effect when a policy wants a human to agree", async () => {
		const handler = new RecordingHandler();
		const executor = executorOf(EffectApprovalPolicy.from(ToolEffect.WRITE));

		const error = await executor
			.execute(commandOf(refundOf(handler), { orderId: "42" }), new ToolBreaker(RunLimits.none()))
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(ToolApprovalRequiredError);
		expect(handler.calls).toBe(0);
	});

	it("runs the same call once a human has agreed to it", async () => {
		const handler = new RecordingHandler();
		const executor = executorOf(EffectApprovalPolicy.from(ToolEffect.WRITE));

		const outcome = await executor.execute(
			commandOf(refundOf(handler), { orderId: "42" }, true),
			new ToolBreaker(RunLimits.none()),
		);

		expect(handler.calls).toBe(1);
		expect(outcome.failed).toBe(false);
	});

	it("moves a result too large for the context out, and leaves a placeholder", async () => {
		const handler = new RecordingHandler({ report: "x".repeat(50) });
		const executor = executorOf(EffectApprovalPolicy.never(), OffloadPolicy.above(10));

		const outcome = await executor.execute(
			commandOf(refundOf(handler), { orderId: "42" }),
			new ToolBreaker(RunLimits.none()),
		);

		expect(outcome.wasOffloaded).toBe(true);
		expect(outcome.contextOutput).toContain("artifact");
		expect(outcome.output).toEqual({ report: "x".repeat(50) });
	});

	it("names a scalar result rather than losing it", async () => {
		const handler = new RecordingHandler(42);

		const outcome = await executorOf().execute(
			commandOf(refundOf(handler), { orderId: "42" }),
			new ToolBreaker(RunLimits.none()),
		);

		expect(outcome.output).toEqual({ value: 42 });
		expect(outcome.contextOutput).toBe("42");
	});

	it("passes text through as text, without quoting it back to the model", async () => {
		const handler = new RecordingHandler("the order was refunded");

		const outcome = await executorOf().execute(
			commandOf(refundOf(handler), { orderId: "42" }),
			new ToolBreaker(RunLimits.none()),
		);

		expect(outcome.contextOutput).toBe("the order was refunded");
	});

	it("tells the tool which call it is answering", async () => {
		const handler = new RecordingHandler();

		const outcome = await executorOf().execute(
			commandOf(refundOf(handler), { orderId: "42" }),
			new ToolBreaker(RunLimits.none()),
		);

		expect(handler.lastContext?.callId.value).toBe("c-1");
		expect(handler.lastContext?.runId.value).toBe("run-1");
		expect(outcome.callId.value).toBe("c-1");
	});

	it("accepts a tool that answers with nothing", async () => {
		const handler = new RecordingHandler(null);

		const outcome = await executorOf().execute(
			commandOf(refundOf(handler), { orderId: "42" }),
			new ToolBreaker(RunLimits.none()),
		);

		expect(outcome.failed).toBe(false);
		expect(outcome.output).toEqual({});
		expect(outcome.contextOutput).toBe("");
	});

	it("counts every call to something that does not exist together, so inventing names still ends the run", async () => {
		const breaker = new ToolBreaker(RunLimits.of(undefined, 2));
		const catalog = ToolCatalog.of([refundOf(new RecordingHandler())]);
		const missing = (name: string): ToolExecutionCommand =>
			new ToolExecutionCommand(SESSION, RUN, SUPPORT, catalog, new ToolInvocation(CALL, name, {}));

		await executorOf().execute(missing("tool_a"), breaker);

		await expect(executorOf().execute(missing("tool_b"), breaker)).rejects.toBeInstanceOf(ToolRepeatedFailureError);
	});

	it("never asks approval for a tool the runtime owns, whatever the policy says", async () => {
		const handler = new RecordingHandler("the whole content");
		const internal = new ToolDefinition(
			"read_artifact",
			"Reads",
			refundOf(handler).schema,
			ToolEffect.READ,
			handler,
			true,
		);

		const outcome = await executorOf(EffectApprovalPolicy.from(ToolEffect.READ)).execute(
			commandOf(internal, { orderId: "42" }),
			new ToolBreaker(RunLimits.none()),
		);

		expect(outcome.failed).toBe(false);
		expect(handler.calls).toBe(1);
	});

	it("never offloads what a runtime tool answered, since that is the content it was fetching back", async () => {
		const long = "x".repeat(200);
		const handler = new RecordingHandler(long);
		const internal = new ToolDefinition(
			"read_artifact",
			"Reads",
			refundOf(handler).schema,
			ToolEffect.READ,
			handler,
			true,
		);

		const outcome = await executorOf(EffectApprovalPolicy.never(), OffloadPolicy.above(10)).execute(
			commandOf(internal, { orderId: "42" }),
			new ToolBreaker(RunLimits.none()),
		);

		expect(outcome.wasOffloaded).toBe(false);
		expect(outcome.contextOutput).toBe(long);
	});
});
