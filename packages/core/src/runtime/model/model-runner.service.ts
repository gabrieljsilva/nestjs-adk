import type { Clock } from "../../common/time/clock.contract";
import type { Duration } from "../../common/time/duration.value-object";
import { SystemClock } from "../../common/time/system-clock.adapter";
import { BackoffRetryPolicy } from "../../domain/agent/backoff-retry.policy";
import { ModelsExhaustedError } from "../../domain/agent/errors/models-exhausted.error";
import { FailoverContext } from "../../domain/agent/failover-context.value-object";
import { ModelReroute } from "../../domain/agent/model-reroute.value-object";
import type { ModelRetryPolicy } from "../../domain/agent/model-retry.policy";
import { RetryAttempt } from "../../domain/agent/retry-attempt.value-object";
import { ModelCallFailedError } from "../../domain/model/errors/model-call-failed.error";
import type { ModelFailure } from "../../domain/model/failures/model-failure.value-object";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import type { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";
import { ModelExecutor } from "./model-executor.service";
import { ModelRunOutcome } from "./model-run-outcome.value-object";
import type { ModelRunCommand } from "./model-run.command";

export class ModelRunner {
	public constructor(
		private readonly clock: Clock = new SystemClock(),
		private readonly retry: ModelRetryPolicy = new BackoffRetryPolicy(),
		private readonly executor: ModelExecutor = new ModelExecutor(),
	) {}

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
		let attempt = 0;

		for (;;) {
			if (attempt === 0) attempted.push(model);
			let emitted = false;
			try {
				const turn = this.executor.stream(command.context, model, command.request, command.signal);
				let step = await turn.next();
				while (step.done !== true) {
					emitted = true;
					yield step.value;
					step = await turn.next();
				}
				return new ModelRunOutcome(step.value, reroutes);
			} catch (error) {
				const failure = this.readFailure(error);
				if (failure === undefined || emitted) throw error;
				attempt += 1;
				const delay = this.findDelay(command, failure, model, attempt);
				if (delay !== undefined) {
					await this.clock.sleep(delay, command.signal);
					continue;
				}
				failures.push(failure);
				const next = await this.next(command, model, attempted, failures);
				reroutes.push(new ModelReroute(model.descriptor().identity, next.descriptor().identity, failure, attempted.length));
				model = next;
				attempt = 0;
			}
		}
	}

	private findDelay(
		command: ModelRunCommand,
		failure: ModelFailure,
		model: LlmModel,
		attempt: number,
	): Duration | undefined {
		if (command.signal?.aborted === true) return undefined;
		const policy = command.retry ?? this.retry;
		return policy.findDelay(new RetryAttempt(failure, model.descriptor().identity, attempt));
	}

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

	private readFailure(error: unknown): ModelFailure | undefined {
		return error instanceof ModelCallFailedError ? error.failure : undefined;
	}
}
