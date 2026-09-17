import type { IdGenerator } from "../../common/identity/id-generator.contract";
import type { Clock } from "../../common/time/clock.contract";
import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../../contracts/storage/session-storage.contract";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import type { AgentCatalog } from "../catalog/agent-catalog.service";
import { ToolCatalog } from "../tool/tool-catalog.service";
import { ContextComposer } from "./context.factory";
import { RuntimeCompositionFailedError } from "./errors/runtime-composition-failed.error";
import { RunComposer } from "./run.factory";
import { RuntimeServices } from "./runtime-services.value-object";
import { RuntimeOptions } from "./runtime.options";
import { SessionComposer } from "./session.factory";

export class RuntimeFactory {
	private disposed = false;

	public async create(
		catalog: AgentCatalog,
		storage: SessionStorage,
		artifacts: ArtifactStorage,
		clock: Clock,
		ids: IdGenerator,
		options: RuntimeOptions = new RuntimeOptions(),
		exposed: readonly ToolDefinition[] = [],
	): Promise<RuntimeServices> {
		try {
			const context = new ContextComposer().compose(storage, artifacts, options.context);
			const run = new RunComposer().compose(catalog, storage, artifacts, clock, ids, context, options);
			const sessions = new SessionComposer().compose(catalog, artifacts, clock, ids, context, run);

			return new RuntimeServices(
				catalog,
				run.resolver,
				run.runner,
				sessions,
				run.runs,
				run.events,
				run.offloader,
				run.readArtifact,
				run.lifecycle,
				run.tracker,
				options.limits,
				run.gate,
				new ToolCatalog(exposed),
			);
		} catch (cause) {
			throw new RuntimeCompositionFailedError(cause instanceof Error ? cause.message : String(cause), cause);
		}
	}

	public async dispose(): Promise<void> {
		this.disposed = true;
	}

	public get isDisposed(): boolean {
		return this.disposed;
	}
}
