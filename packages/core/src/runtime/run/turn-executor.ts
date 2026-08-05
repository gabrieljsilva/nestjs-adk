import { AgentName } from "../../domain/agent/agent-name";
import type { SessionEvent } from "../../domain/event/session-event";
import { SessionEventBatch } from "../../domain/event/session-event-batch";
import type { PendingCall } from "../../domain/session/pending-call";
import type { SkillDefinition } from "../../domain/skill/skill-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolInvocation } from "../../domain/tool/tool-invocation";
import type { ToolOutcome } from "../../domain/tool/tool-outcome";
import { ActivateSkillTool } from "../skill/activate-skill-tool";
import type { SkillCatalog } from "../skill/skill-catalog";
import { ToolExecutionCommand } from "../tool/tool-execution-command";
import type { ToolExecutor } from "../tool/tool-executor";
import { TransferToAgentTool } from "../transfer/transfer-to-agent-tool";
import type { RunJournal } from "./run-journal";
import type { RunScope } from "./run-scope";

/**
 * Runs the calls of one turn, with the declared effect deciding what may overlap.
 *
 * A model that asked to look three orders up meant three independent questions, and
 * answering them one after another is latency nobody bought. A model that asked to refund
 * and then to close an order meant that order, and running those together is a bug with a
 * receipt. So consecutive reads run concurrently and anything that changes the world is a
 * barrier: it runs alone, after everything before it and before everything after it.
 *
 * Whatever the execution order, results are journaled in the order the model asked. The
 * conversation it reads back is the conversation it wrote, and a reader of the journal
 * cannot tell which calls happened to overlap.
 *
 * A call somebody refused produces the refusal as its result instead of running. The
 * model reads it like any other failure, which is what tells it the door was closed
 * rather than broken.
 */
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
	): Promise<SessionEventBatch> {
		const events: SessionEvent[] = [];
		for (const group of this.groupsOf(scope, calls, delegated)) {
			const produced =
				group.length === 1
					? [await this.runOne(scope, group[0], approved, delegated)]
					: await Promise.all(group.map((call) => this.runOne(scope, call, approved, delegated)));
			for (const one of produced) events.push(...one);
		}
		return SessionEventBatch.of(events);
	}

	/** Everything one call produced, in the order a reader of the journal has to see it. */
	private async runOne(
		scope: RunScope,
		call: PendingCall | undefined,
		approved: boolean,
		delegated: ReadonlyMap<string, string>,
	): Promise<readonly SessionEvent[]> {
		if (call === undefined) return [];
		if (call.isDenied) return [this.journal.refusal(scope.started, call)];

		const answer = delegated.get(call.callId.value);
		if (answer !== undefined) return [this.journal.delegatedResult(scope.started, call, answer)];

		const outcome = await this.tools.execute(this.commandOf(scope, call, approved), scope.breaker);
		const events: SessionEvent[] = [this.journal.result(scope.started, outcome)];

		const activated = this.activatedBy(call, outcome, scope.skills);
		if (activated !== undefined) events.push(this.journal.activation(scope.started, activated, call.callId));

		const target = this.transferredBy(call, outcome, scope);
		if (target !== undefined) events.push(this.journal.transfer(scope.started, scope.agent, target));
		return events;
	}

	/**
	 * The calls of the turn, split into what may run together.
	 *
	 * Consecutive is the point: reads that surround a write do not jump over it. Grouping
	 * every read of the turn regardless of position would reorder a read that the model
	 * asked for *after* a write, and reading before instead of after is a different answer.
	 */
	private groupsOf(
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

	/**
	 * True when running this call next to another one cannot change what either of them does.
	 *
	 * A refusal and an answer a child run already produced are values, not effects. A tool
	 * that declared itself a read changes nothing by contract. Everything else, including a
	 * tool the catalog does not know, runs alone: a call whose effect nobody can name is not
	 * a call to take chances with.
	 */
	private mayOverlap(scope: RunScope, call: PendingCall, delegated: ReadonlyMap<string, string>): boolean {
		if (call.isDenied || delegated.has(call.callId.value)) return true;
		const tool = scope.catalog.find(call.toolName);
		return tool?.effect.equals(ToolEffect.READ) === true;
	}

	private commandOf(scope: RunScope, call: PendingCall, approved: boolean): ToolExecutionCommand {
		return new ToolExecutionCommand(
			scope.sessionId,
			scope.run.id,
			scope.agent,
			scope.catalog,
			new ToolInvocation(call.callId, call.toolName, call.args),
			scope.signal,
			approved,
		);
	}

	/**
	 * The skill a successful activation loaded, if that is what the call was.
	 * The activation is journaled next to the result it arrived as, which is what lets the
	 * context keep the content where it landed rather than copy it to the front.
	 */
	private activatedBy(call: PendingCall, outcome: ToolOutcome, skills: SkillCatalog): SkillDefinition | undefined {
		if (outcome.failed || call.toolName !== ActivateSkillTool.NAME) return undefined;
		const name = call.args.skillName;
		return typeof name === "string" ? skills.find(name) : undefined;
	}

	/**
	 * The agent a successful handover named, if that is what the call was.
	 *
	 * The declared edge is checked again here even though the tool's schema already refused
	 * anything else. The schema is what the model is held to; this is what the journal is
	 * held to, and an event that moves a session is worth two answers to the same question.
	 */
	private transferredBy(call: PendingCall, outcome: ToolOutcome, scope: RunScope): AgentName | undefined {
		if (outcome.failed) return undefined;
		const declared = TransferToAgentTool.targetOf(call.toolName, call.args);
		if (declared === undefined) return undefined;
		const target = AgentName.from(declared);
		return scope.definition.transfer.allows(target) ? target : undefined;
	}
}
