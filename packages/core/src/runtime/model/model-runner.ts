import { ModelsExhaustedError } from "../../domain/agent/errors/models-exhausted.error";
import { FailoverContext } from "../../domain/agent/failover-context";
import { ModelReroute } from "../../domain/agent/model-reroute";
import { ModelCallFailedError } from "../../domain/model/errors/model-call-failed.error";
import type { LlmModel } from "../../domain/model/llm-model";
import type { ModelChunk } from "../../domain/model/model-chunk";
import type { ModelFailure } from "../../domain/model/model-failure";
import { ModelExecutor } from "./model-executor";
import type { ModelRunCommand } from "./model-run-command";
import { ModelRunOutcome } from "./model-run-outcome";

/**
 * Runs one turn, through as many models as the policy is willing to offer.
 *
 * Reroute happens before the first chunk and never after. Once part of an answer has
 * reached the caller, switching models would mean a second beginning arriving after a
 * first one, so a failure mid stream propagates as it is: the caller has already seen
 * what happened, and pretending otherwise would corrupt the text.
 *
 * Only a classified failure reroutes. An error the adapter could not turn into a
 * `ModelFailure` is not a provider saying no, it is a bug, and retrying a bug on another
 * model just runs it twice.
 */
export class ModelRunner {
	public constructor(private readonly executor: ModelExecutor = new ModelExecutor()) {}

	public async run(command: ModelRunCommand): Promise<ModelRunOutcome> {
		const turn = this.stream(command);
		let step = await turn.next();
		while (step.done !== true) step = await turn.next();
		return step.value;
	}

	public async *stream(command: ModelRunCommand): AsyncGenerator<ModelChunk, ModelRunOutcome> {
		const attempted: LlmModel[] = [];
		const failures: ModelFailure[] = [];
		const reroutes: ModelReroute[] = [];
		let model = command.model;

		for (;;) {
			attempted.push(model);
			let emitted = false;
			try {
				const turn = this.executor.stream(model, command.request, command.signal);
				let step = await turn.next();
				while (step.done !== true) {
					emitted = true;
					yield step.value;
					step = await turn.next();
				}
				return new ModelRunOutcome(step.value, reroutes);
			} catch (error) {
				const failure = this.failureOf(error);
				if (failure === undefined || emitted) throw error;
				failures.push(failure);
				const next = await this.next(command, model, attempted, failures);
				reroutes.push(new ModelReroute(model.descriptor().identity, next.descriptor().identity, failure, attempted.length));
				model = next;
			}
		}
	}

	/** No policy, or a policy that declines, both mean the chain is over. */
	private async next(
		command: ModelRunCommand,
		current: LlmModel,
		attempted: readonly LlmModel[],
		failures: readonly ModelFailure[],
	): Promise<LlmModel> {
		const failure = failures[failures.length - 1];
		const policy = command.failover;
		const next =
			policy === undefined || failure === undefined
				? undefined
				: await policy.next(failure, new FailoverContext(command.runId, current, attempted, failures));
		if (next !== undefined) return next;
		throw new ModelsExhaustedError(
			command.agent.value,
			attempted.map((model) => model.descriptor().identity.toString()),
			failures.map((each) => each.kind),
			failures[failures.length - 1]?.message,
		);
	}

	private failureOf(error: unknown): ModelFailure | undefined {
		return error instanceof ModelCallFailedError ? error.failure : undefined;
	}
}
