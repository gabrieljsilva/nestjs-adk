import type { ToolCallObserver } from "../../../contracts/tool/tool-call-observer.contract";
import { AgentName } from "../../../domain/agent/agent-name.value-object";
import { SessionEventBatch } from "../../../domain/event/session-event-batch.value-object";
import type { SessionEvent } from "../../../domain/event/session-event.event";
import type { PendingCall } from "../../../domain/session/approval/pending-call.value-object";
import type { SkillDefinition } from "../../../domain/skill/skill-definition.value-object";
import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ToolInvocation } from "../../../domain/tool/invocation/tool-invocation.value-object";
import { ToolOutcome } from "../../../domain/tool/invocation/tool-outcome.value-object";
import { ToolResultNotice } from "../../../domain/tool/notice/tool-result.notice";
import { ActivateSkillTool } from "../../skill/activate-skill.tool";
import type { SkillCatalog } from "../../skill/skill-catalog.service";
import { ToolExecutionCommand } from "../../tool/tool-execution.command";
import type { ToolExecutor } from "../../tool/tool-executor.service";
import { TransferToAgentTool } from "../../transfer/transfer-to-agent.tool";
import type { RunJournal } from "../journal/run-journal.service";
import type { RunScope } from "../scope/run-scope.value-object";

export class TurnExecutor {
	public constructor(
		private readonly tools: ToolExecutor,
		private readonly journal: RunJournal,
	) {}

	public async execute(
		scope: RunScope,
		calls: readonly PendingCall[],
		approved: boolean,
		delegated: ReadonlyMap<string, string> = new Map(),
		observer?: ToolCallObserver,
	): Promise<SessionEventBatch> {
		const events: SessionEvent[] = [];
		for (const group of this.buildGroups(scope, calls, delegated)) {
			const produced =
				group.length === 1
					? [await this.runOne(scope, group[0], approved, delegated, observer)]
					: await Promise.all(group.map((call) => this.runOne(scope, call, approved, delegated, observer)));
			for (const one of produced) events.push(...one);
		}
		return new SessionEventBatch(events);
	}

	private async runOne(
		scope: RunScope,
		call: PendingCall | undefined,
		approved: boolean,
		delegated: ReadonlyMap<string, string>,
		observer?: ToolCallObserver,
	): Promise<readonly SessionEvent[]> {
		if (call === undefined) return [];
		if (call.isDenied) {
			await this.settle(scope, ToolOutcome.refused(call.callId, call.toolName, call.reason ?? ""), observer);
			return [this.journal.refusal(scope.started, call)];
		}

		const answer = delegated.get(call.callId.value);
		if (answer !== undefined) {
			await this.settle(scope, ToolOutcome.succeeded(call.callId, call.toolName, { answer }, answer), observer);
			return [this.journal.delegatedResult(scope.started, call, answer)];
		}

		const outcome = await this.tools.execute(this.buildCommand(scope, call, approved), scope.breaker);
		await this.settle(scope, outcome, observer);
		const events: SessionEvent[] = [this.journal.result(scope.started, outcome)];

		const activated = this.activatedBy(call, outcome, scope.skills);
		if (activated !== undefined) events.push(this.journal.activation(scope.started, activated, call.callId));

		const target = this.transferredBy(call, outcome, scope);
		if (target !== undefined) events.push(this.journal.transfer(scope.started, scope.agent, target));
		return events;
	}

	private async settle(scope: RunScope, outcome: ToolOutcome, observer?: ToolCallObserver): Promise<void> {
		if (observer === undefined) return;
		await observer.settled(scope.context, new ToolResultNotice(outcome, scope.catalog.find(outcome.toolName)));
	}

	private buildGroups(
		scope: RunScope,
		calls: readonly PendingCall[],
		delegated: ReadonlyMap<string, string>,
	): readonly (readonly PendingCall[])[] {
		const groups: PendingCall[][] = [];
		let open: PendingCall[] | undefined;
		for (const call of calls) {
			if (!this.mayOverlap(scope, call, delegated)) {
				groups.push([call]);
				open = undefined;
				continue;
			}
			if (open === undefined) {
				open = [];
				groups.push(open);
			}
			open.push(call);
		}
		return groups;
	}

	private mayOverlap(scope: RunScope, call: PendingCall, delegated: ReadonlyMap<string, string>): boolean {
		if (call.isDenied || delegated.has(call.callId.value)) return true;
		const tool = scope.catalog.find(call.toolName);
		return tool?.effect.equals(ToolEffect.READ) === true;
	}

	private buildCommand(scope: RunScope, call: PendingCall, approved: boolean): ToolExecutionCommand {
		return new ToolExecutionCommand(
			scope.context,
			scope.catalog,
			new ToolInvocation(call.callId, call.toolName, call.args),
			approved,
		);
	}

	private activatedBy(call: PendingCall, outcome: ToolOutcome, skills: SkillCatalog): SkillDefinition | undefined {
		if (outcome.failed || call.toolName !== ActivateSkillTool.NAME) return undefined;
		const name = call.args.skillName;
		return typeof name === "string" ? skills.find(name) : undefined;
	}

	private transferredBy(call: PendingCall, outcome: ToolOutcome, scope: RunScope): AgentName | undefined {
		if (outcome.failed) return undefined;
		const declared = TransferToAgentTool.findTarget(call.toolName, call.args);
		if (declared === undefined) return undefined;
		const target = AgentName.from(declared);
		return scope.definition.transfer.allows(target) ? target : undefined;
	}
}
