---
"@nestjs-adk/core": major
"@nestjs-adk/google": major
"@nestjs-adk/openai": major
"@nestjs-adk/testing": major
---

Options in groups, commands as objects, and a retry that is not a failover.

**`RuntimeOptions` is five groups plus `limits`.** Eighteen positional parameters became `context`, `cost`, `tools`, `lifecycle` and `model`, each its own value object with its own defaults and its own `with`. `RuntimeOptions.from` and `RuntimeOptionsPatch` are nested to match, and a group named partially keeps the fields beside it, so `{ cost: { pricing } }` leaves `pricingNotices` alone.

```ts
RuntimeOptions.from({
	context: { summarizer, compaction, compactionStrategy, attachments, offload, contextNotices },
	cost: { pricing, pricingNotices },
	tools: { approvals, access, sources },
	lifecycle: { shutdown, snapshots, consumers, consumerNotices, redactor },
	model: { resolver, retry },
	limits,
});
```

`models` is now `model.resolver`, and `limits` stayed at the top because it is the one answer here that is a number rather than a component. The `ADK_RUNTIME_PATCH` token and `AdkTestBedBuilder.withRuntime` take the same nested shape. The runtime group of tool options is exported as `ToolingOptions`, because `ToolOptions` already means what `@Tool` declares.

**Long parameter lists became input objects.** `new AgentDefinition({ name, description, model, ... })`, `new AgentRunCommand({ agent, input, ... })`, `new AskInput({ message, attachments, sessionId, references, metadata, limits })`, `new ModelRunCommand({ ... })`, `new PrepareContextCommand({ ... })`, `new ApproveInput({ ... })`, `new RejectInput({ ... })` and `new AdkModuleOptions({ ... })`. `AskInput.fromMessage(message, sessionId?)` is unchanged; `AskInput.with` is gone, and so are `ToolOutput.with` and `ToolOutput.fromData`, replaced by `new ToolOutput(data, media?)`.

**`AgentRegistry.get` is `AgentRegistry.open`.** It creates the handle when there is none, which is what `open` promises and `get` does not.

**A model is now asked again before another one is asked instead.** `ModelRetryPolicy` is a new component, consulted by `ModelRunner` before `AgentFailoverPolicy`. `BackoffRetryPolicy` ships on by default: two retries, exponential backoff with full jitter, capped at twenty seconds, and a `Retry-After` the provider sent wins over any calculation. Only a transient failure is retried, so a refused request, a safety block and a context overflow still go straight to failover. Attempts are counted per model, so each link of a chain gets its own budget, and a chain that exhausts everything still fails with `ModelsExhaustedError`.

```ts
runtime: RuntimeOptions.from({ model: { retry: new BackoffRetryPolicy(4) } });

@Agent({ name: "charger", description: "...", retry: false }) // never repeats a call
```

`RateLimitedFailure` and `UnavailableFailure` carry a `retryAfter: Duration`, and the Gemini and OpenAI mappers fill it from the provider's `Retry-After` header in either of its RFC 9110 forms. `ModelFailure.retryAfter` answers `undefined` for every other failure, so a policy never asks which class it is holding.

`Clock` gains `sleep(duration, signal?)` with a real timer as its default, and `FakeClock` advances itself instead and records what it was asked to wait for. Nothing in the runtime waits any other way, so a backoff is asserted rather than waited for. A `Clock` written outside this package keeps working untouched.
