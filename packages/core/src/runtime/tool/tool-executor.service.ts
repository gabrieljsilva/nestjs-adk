import { CanonicalJson } from "../../common/serialization/canonical-json.service";
import { OffloadedContent } from "../../domain/artifact/offloaded-content.value-object";
import type { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import type { MediaPart } from "../../domain/model/messages/media-part.value-object";
import type { Actor } from "../../domain/tool/access/actor.value-object";
import { AdkApprovalPolicy } from "../../domain/tool/approval/adk-approval.policy";
import { EffectApprovalPolicy } from "../../domain/tool/approval/effect-approval.policy";
import { ToolApprovalRequiredError } from "../../domain/tool/errors/tool-approval-required.error";
import { ToolNotFoundError } from "../../domain/tool/errors/tool-not-found.error";
import { ToolContext } from "../../domain/tool/invocation/tool-context.value-object";
import type { ToolInvocation } from "../../domain/tool/invocation/tool-invocation.value-object";
import { ToolOutcome } from "../../domain/tool/invocation/tool-outcome.value-object";
import { ToolOutput } from "../../domain/tool/invocation/tool-output.value-object";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import type { ArtifactOffloader } from "../artifact/artifact-offloader.service";
import { AttachmentStore } from "../artifact/attachment-store.service";
import type { ToolBreaker } from "./tool-breaker.service";
import type { ToolCatalog } from "./tool-catalog.service";
import type { ToolExecutionCommand } from "./tool-execution.command";
import { ToolGate } from "./tool-gate.service";

const SCALAR_FIELD = "value";

const UNKNOWN_TOOL = "<unknown>";

export class ToolExecutor {
	public constructor(
		private readonly offloader: ArtifactOffloader,
		private readonly approvals: AdkApprovalPolicy = EffectApprovalPolicy.never(),
		private readonly attachments: AttachmentStore = AttachmentStore.none(),
		private readonly gate: ToolGate = new ToolGate(),
	) {}

	public allHeld(
		catalog: ToolCatalog,
		invocations: readonly ToolInvocation[],
		actor?: Actor,
	): readonly ToolInvocation[] {
		return invocations.filter(
			(invocation) =>
				catalog.has(invocation.toolName) &&
				this.requiresApproval(catalog.findOrFail(invocation.toolName), invocation, actor),
		);
	}

	public async execute(command: ToolExecutionCommand, breaker: ToolBreaker): Promise<ToolOutcome> {
		const invocation = command.invocation;
		const tool = this.find(command);
		if (tool === undefined) {
			const reason = new ToolNotFoundError(invocation.toolName, command.catalog.names).message;
			return this.fail(command, breaker, reason, UNKNOWN_TOOL);
		}

		const admission = await this.gate.admit(tool, invocation, command.actor);
		if (!admission.isAdmitted) {
			if (admission.wasDenied) {
				breaker.recordFailure(tool.name, admission.reason);
				return ToolOutcome.refused(invocation.callId, tool.name, admission.reason);
			}
			breaker.recordInvalidArgs(tool.name, admission.reason);
			return ToolOutcome.failed(invocation.callId, tool.name, admission.reason);
		}
		breaker.recordValidArgs(tool.name);

		if (!command.approved && this.requiresApproval(tool, invocation, command.actor)) {
			throw new ToolApprovalRequiredError(tool.name, invocation.callId.value, tool.effect.name);
		}

		return this.invoke(command, tool, admission.values, breaker);
	}

	private requiresApproval(tool: ToolDefinition, invocation: ToolInvocation, actor?: Actor): boolean {
		return this.approvals.requires(tool, invocation, actor);
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
		const context = command.toToolContext();

		let answered: unknown;
		try {
			answered = await tool.handler.invoke(args, context);
		} catch (error) {
			return this.fail(command, breaker, error instanceof Error ? error.message : String(error));
		}

		breaker.recordSuccess(tool.name);
		const produced = answered instanceof ToolOutput ? answered.data : answered;
		const media = answered instanceof ToolOutput ? answered.media : [];
		const text = this.formatText(produced);
		const offloaded = await this.offloader.offload(command.context, text);
		return ToolOutcome.succeeded(
			invocation.callId,
			tool.name,
			this.buildRecord(produced),
			offloaded.text,
			offloaded.reference,
			await this.stored(command, media),
		);
	}

	private async stored(
		command: ToolExecutionCommand,
		media: readonly MediaPart[],
	): Promise<readonly AttachmentReference[]> {
		if (media.length === 0) return [];
		try {
			return await this.attachments.store(command.context, media);
		} catch {
			return [];
		}
	}

	private fail(command: ToolExecutionCommand, breaker: ToolBreaker, reason: string, counted?: string): ToolOutcome {
		breaker.recordFailure(counted ?? command.invocation.toolName, reason);
		return ToolOutcome.failed(command.invocation.callId, command.invocation.toolName, reason);
	}

	private formatText(produced: unknown): string {
		if (produced === undefined || produced === null) return "";
		return typeof produced === "string" ? produced : CanonicalJson.stringify(produced);
	}

	private buildRecord(produced: unknown): Record<string, unknown> {
		if (produced === undefined || produced === null) return {};
		if (typeof produced !== "object" || Array.isArray(produced)) return { [SCALAR_FIELD]: produced };
		return { ...produced };
	}
}
