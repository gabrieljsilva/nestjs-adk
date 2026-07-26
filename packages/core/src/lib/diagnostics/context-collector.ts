import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { ContextSnapshot } from "./context-types";

/**
 * Context diagnostics collector (same mold as PricingSource/AdkEmbedder: opt-in, with an active
 * instance test matchers can reach without extra injection). Enable it with
 * AdkModule.forRoot({ diagnostics: true }) — off by default, so production runs capture nothing.
 *
 * Buckets are per-run and live in the run's own scope, like the engine's reroutes: concurrent runs
 * never mix. The WeakMap keys on the result object itself, which is what allows
 * `expect([runA, runB])` without inventing a public run id — and it frees itself when the test
 * drops the result.
 */
@Injectable()
export class ContextCollector implements OnModuleDestroy {
	private static active?: ContextCollector;

	/** Keyed by RunResult, or by the Error when the run threw — a failed run is worth inspecting too. */
	private readonly byOwner = new WeakMap<object, ContextSnapshot[]>();

	/** Set by AdkModule when diagnostics are on. */
	public static setActive(instance: ContextCollector | undefined): void {
		ContextCollector.active = instance;
	}

	/** The module-configured collector, or undefined when diagnostics are off. */
	public static getActive(): ContextCollector | undefined {
		return ContextCollector.active;
	}

	/** Fresh bucket for one run — the engine pushes one snapshot per model call into it. */
	public open(): ContextSnapshot[] {
		return [];
	}

	public attach(owner: object, snapshots: ContextSnapshot[]): void {
		this.byOwner.set(owner, snapshots);
	}

	/** Snapshots captured during the run that produced this result (or this error). Only ask() correlates. */
	public snapshotsOf(owner: object): ContextSnapshot[] | undefined {
		return this.byOwner.get(owner);
	}

	/** Without this, a closed app leaves a dead collector active and the next module sees stale state. */
	public onModuleDestroy(): void {
		if (ContextCollector.active === this) ContextCollector.setActive(undefined);
	}
}
