import { CanonicalJson } from "../../common/serialization/canonical-json";
import { OffloadedContent } from "../../domain/artifact/offloaded-content";
import type { AttachmentReference } from "../../domain/model/attachment-reference";
import type { MediaPart } from "../../domain/model/media-part";
import { AdkApprovalPolicy } from "../../domain/tool/adk-approval-policy";
import { EffectApprovalPolicy } from "../../domain/tool/effect-approval-policy";
import { ToolApprovalRequiredError } from "../../domain/tool/errors/tool-approval-required.error";
import { ToolNotFoundError } from "../../domain/tool/errors/tool-not-found.error";
import { ToolContext } from "../../domain/tool/tool-context";
import type { ToolDefinition } from "../../domain/tool/tool-definition";
import type { ToolInvocation } from "../../domain/tool/tool-invocation";
import { ToolOutcome } from "../../domain/tool/tool-outcome";
import { ToolOutput } from "../../domain/tool/tool-output";
import type { ArtifactOffloader } from "../artifact/artifact-offloader";
import { AttachmentStore } from "../artifact/attachment-store";
import type { ToolBreaker } from "./tool-breaker";
import type { ToolCatalog } from "./tool-catalog";
import type { ToolExecutionCommand } from "./tool-execution-command";

/** Where a result that is not an object goes, so the journal always holds a record. */
const SCALAR_FIELD = "value";

/**
 * The one name every call to something that does not exist is counted under.
 *
 * Counting those per name would not count at all: a model that answers a missing tool by
 * inventing a different missing tool starts a fresh streak every time, and the breaker
 * that exists to stop exactly that would never reach its limit.
 */
const UNKNOWN_TOOL = "<unknown>";

/**
 * Runs one tool call, from the arguments a model wrote to the result the model reads.
 *
 * The order is what makes it safe. Arguments are validated before anything is invoked,
 * so a call the schema refuses runs the tool zero times. Approval is asked before the
 * handler, because the point of asking is that the effect has not happened. And the
 * result is offloaded after it exists, because how large it is cannot be known before.
 *
 * What goes wrong is handed back to the model rather than thrown, on purpose: the model
 * asked for the call and can usually recover from being told it failed. The breaker is
 * what stops that from becoming a loop, and it is the only thing here that ends a run.
 */
export class ToolExecutor {
	public constructor(
		private readonly offloader: ArtifactOffloader,
		private readonly approvals: AdkApprovalPolicy = EffectApprovalPolicy.never(),
		/** Where an image a tool produced is written; without one, a tool can only answer data. */
		private readonly attachments: AttachmentStore = AttachmentStore.none(),
	) {}

	/**
	 * Every call of a turn a human has to agree to.
	 *
	 * The run asks before it executes anything, so a turn that mixes a lookup with a
	 * refund does not half happen: either the whole turn runs or none of it does, and
	 * what a human is shown is a decision they can take without having to know what
	 * already ran alongside it. All of them, not the first: releasing a turn on one answer
	 * would run the calls nobody had answered for yet.
	 */
	public allHeld(catalog: ToolCatalog, invocations: readonly ToolInvocation[]): readonly ToolInvocation[] {
		return invocations.filter(
			(invocation) =>
				catalog.has(invocation.toolName) && this.requiresApproval(catalog.findOrFail(invocation.toolName), invocation),
		);
	}

	public async execute(command: ToolExecutionCommand, breaker: ToolBreaker): Promise<ToolOutcome> {
		const invocation = command.invocation;
		const tool = this.find(command);
		if (tool === undefined) {
			const reason = new ToolNotFoundError(invocation.toolName, command.catalog.names).message;
			return this.fail(command, breaker, reason, UNKNOWN_TOOL);
		}

		const parsed = tool.schema.parse(invocation.args);
		if (!parsed.isValid) {
			breaker.recordInvalidArgs(tool.name, parsed.reason);
			return ToolOutcome.failed(invocation.callId, tool.name, parsed.reason);
		}
		breaker.recordValidArgs(tool.name);

		if (!command.approved && this.requiresApproval(tool, invocation)) {
			throw new ToolApprovalRequiredError(tool.name, invocation.callId.value, tool.effect.name);
		}

		return this.invoke(command, tool, parsed.values, breaker);
	}

	/** A tool the runtime owns answers to no policy: nothing an application wrote declared it. */
	private requiresApproval(tool: ToolDefinition, invocation: ToolInvocation): boolean {
		return !tool.internal && this.approvals.requires(tool, invocation);
	}

	private find(command: ToolExecutionCommand): ToolDefinition | undefined {
		return command.catalog.has(command.invocation.toolName)
			? command.catalog.findOrFail(command.invocation.toolName)
			: undefined;
	}

	private async invoke(
		command: ToolExecutionCommand,
		tool: ToolDefinition,
		args: Record<string, unknown>,
		breaker: ToolBreaker,
	): Promise<ToolOutcome> {
		const invocation = command.invocation;
		const context = new ToolContext(command.sessionId, command.runId, command.agent, invocation.callId, command.signal);

		let answered: unknown;
		try {
			answered = await tool.handler.invoke(args, context);
		} catch (error) {
			return this.fail(command, breaker, error instanceof Error ? error.message : String(error));
		}

		breaker.recordSuccess(tool.name);
		const produced = answered instanceof ToolOutput ? answered.data : answered;
		const media = answered instanceof ToolOutput ? answered.media : [];
		const text = this.textOf(produced);
		// A tool that exists to bring content back into the context must not have it taken out again.
		const offloaded = tool.internal
			? OffloadedContent.inline(text)
			: await this.offloader.offload(command.sessionId, text);
		return ToolOutcome.succeeded(
			invocation.callId,
			tool.name,
			this.recordOf(produced),
			offloaded.text,
			offloaded.reference,
			await this.stored(command, media),
		);
	}

	/**
	 * Keeps what the tool produced even when its image could not be written.
	 *
	 * The effect already happened, so failing the call would tell the model to run a tool
	 * that already ran, and that is how a refund happens twice. The data is the answer and
	 * the image was the illustration: the answer survives without it.
	 */
	private async stored(
		command: ToolExecutionCommand,
		media: readonly MediaPart[],
	): Promise<readonly AttachmentReference[]> {
		if (media.length === 0) return [];
		try {
			return await this.attachments.store(command.sessionId, media);
		} catch {
			return [];
		}
	}

	/** Counting the failure may end the run; when it does not, the model is told and tries again. */
	private fail(command: ToolExecutionCommand, breaker: ToolBreaker, reason: string, counted?: string): ToolOutcome {
		breaker.recordFailure(counted ?? command.invocation.toolName, reason);
		return ToolOutcome.failed(command.invocation.callId, command.invocation.toolName, reason);
	}

	/** What the model reads: text stays text, and anything else is rendered the one way it can be. */
	private textOf(produced: unknown): string {
		if (produced === undefined || produced === null) return "";
		return typeof produced === "string" ? produced : CanonicalJson.stringify(produced);
	}

	/** What the journal keeps: always a record, so a scalar result is named rather than lost. */
	private recordOf(produced: unknown): Record<string, unknown> {
		if (produced === undefined || produced === null) return {};
		if (typeof produced !== "object" || Array.isArray(produced)) return { [SCALAR_FIELD]: produced };
		return { ...produced };
	}
}
