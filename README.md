# nestjs-adk

**NestJS-native** AI agent framework: decorators, DI and abstract contracts over pluggable engines — Google ADK as the primary engine.

```ts
@Agent({
	name: "support_agent",
	description: "Customer support.",
	model: "gemini-2.5-flash",
	prompt: "You are the store's support agent.",
	tools: [LookupOrderTool],
})
export class SupportAgent extends AdkAgent {}

// consumption — the agent instance IS the handle (plain Nest DI)
constructor(private readonly support: SupportAgent) {}
const { text } = await this.support.ask({ sessionId, message: "where is my order?" });
```

The whole mental model in 3 rules:

1. **`AdkModule.forRoot(...)`** — once per app, configures the engine (`engine`, `defaultModel`, stores, logging, embedder).
2. **`providers: []`** — agents, tools, skills and prompt classes are ordinary Injectables; registration is plain Nest. Forgot a class? Boot fails pointing at it (`UnregisteredToolError` etc.).
3. **Consumption** — inject the agent class and call `ask()` / `stream()` / `approve()` / `reject()`.

## Packages

| Package | Role |
|---|---|
| [`@nestjs-adk/core`](packages/core) | Decorators, contracts, `AdkModule`, runner, Continuity |
| [`@nestjs-adk/google`](packages/google) | `@google/adk` engine adapter (native LlmAgent/FunctionTool) |
| [`@nestjs-adk/mcp`](packages/mcp) | Consume external MCP servers as tools |
| [`@nestjs-adk/testing`](packages/testing) | `TestAgent` (stackable mocks), `ScriptedEngine`/`ScriptedModel`, Vitest matchers, LLM-as-judge |

Real consumption example: [apps/playground](apps/playground).

## Module

```ts
@Module({
	imports: [
		AdkModule.forRoot({
			engine: GoogleAdkEngine,          // AdkEngine contract — swappable (ScriptedEngine in tests)
			defaultModel: "gemini-2.5-flash", // string or model spec class; agents can override
			session: PrismaSessionStore,      // SessionStore contract (default: in-memory)
			artifacts: InMemoryArtifactStore, // ArtifactStore contract
			prompts: { dir: "./prompts" },    // root of the .md files
			logging: "debug",                 // see the Logs section
			embedder: GeminiEmbedder,         // Embedder contract (no default — bring your own)
			context: contextPolicy({ ... }),  // global Continuity default, overridable per agent
		}),
	],
	providers: [SupportAgent, LookupOrderTool, SupportPrompt, OrdersService, ChatService],
})
export class AppModule {}
```

`forRootAsync({ engine, useFactory, inject })` is available; the engine is always static (a class). The root module is global (runner/stores injectable anywhere); agents follow normal module scoping. Boot validates everything **fail-fast**: duplicate names, unregistered tool/skill/subAgent/prompt, agent without a model — config errors blow up at startup pointing at the class, never at runtime.

## Tools & Skills

**Shared tool → class** (`AdkTool` contract, Zod schema = declaration for the model + input typing):

```ts
const schema = z.object({ city: z.string().describe("City name") });

@Tool({ name: "get_weather", description: "Current weather.", schema })
export class GetWeatherTool extends AdkTool<typeof schema> {
	constructor(private readonly weather: WeatherService) { super(); }

	execute(input: z.infer<typeof schema>, ctx: ToolContext) {
		// input ← decided by the model | ctx ← application data (userId, attributes, state)
		return this.weather.fetch(input.city); // serializable return goes back to the LLM
	}
}
```

**Agent-exclusive tool → inline method** with `@Tool({ description, schema })`. Sensitive data (tenantId, userId) **never** enters the schema — it arrives via `ctx` (`ask({ attributes, state })`), out of the model's reach.

**Skills** are domain instructions: `@Skill({ name, description })` on a class (`AdkSkill`) or an agent method. `mode: "always"` always enters the instruction; the default is on-demand (catalog + `load_skill` tool).

## Prompts

Two surfaces, each with one meaning:

```ts
// A) Directly on @Agent — literal text OR .md file (distinct fields)
@Agent({ name: "support", prompt: "You are the store's support agent." })
@Agent({ name: "support", promptFile: "agents/support/main.prompt.md" }) // via forRoot's prompts.dir
@Agent({ name: "support", promptFile: "./prompts/main.prompt.md" })      // relative to the agent's file

// B) Builder — AdkPrompt class (full DI + run data via ask({ attributes, state }))
@Injectable()
class SupportPrompt extends AdkPrompt {
	constructor(private readonly config: SupportConfig) { super(); }
	build(ctx: PromptContext) {
		return this.fromFile("agents/support/main.prompt.md", { tone: this.config.tone, plan: ctx.state.get("plan") });
	}
}
@Agent({ name: "support", prompt: SupportPrompt }) // registered as a provider
```

`.md` templates use `{{var}}` and are cached in memory (one read per file); `prompt` + `promptFile` together fail at boot. The final instruction is composed in deterministic order (prompt → `always` skills → on-demand catalog) — a stable prefix for the provider's implicit caching. Build caveat: `.md` files must be copied to `dist` (assets); in production prefer `prompts.dir` over `./`-relative paths.

## Models

`model` (on `@Agent`) and `defaultModel` (on `forRoot`) accept a `string` or a **model spec class** — pure-data value objects; the active engine materializes them:

```ts
model: "gemini-2.5-flash"
model: new Gemini("gemini-2.5-flash", { vertexai, project, labels, cache: { content }, config })
model: new OpenAiLike("gpt-4o-mini", { baseUrl, apiKeyEnv })  // OpenAI, OpenRouter, Ollama, xAI...
model: new ModelRouter({ targets: { primary: new Gemini("..."), fallback: new OpenAiLike("...") } })
```

- `Gemini` (canonical import: `@nestjs-adk/google`): `labels` for billing (Vertex), `cache` for explicit cachedContent, `config` is a free passthrough of `GenerateContentConfig`.
- `ModelRouter`: failover in declared order when the target fails before the 1st chunk (e.g. 429); each reroute becomes a `model_rerouted` event. As `defaultModel`, it's global failover in 1 line.
- Per-run labels: `ask({ labels })`.

## Sessions & Continuity

- `sessionId` present → **persistent** session via `SessionStore` (contract with `get/create/append/updateState` — implement it with Prisma/Postgres etc.; default in-memory). `sessionId` omitted → ephemeral.
- The `SessionStore` is the **system of record**: the engine re-hydrates the context from the history on every run.
- **Automatic offload**: a tool result above 20k chars becomes an artifact (`ArtifactStore`) and the model receives a summary + a `read_artifact` tool to query it on demand (opt-out per tool: `offload: false`).
- **Compaction**: `context: contextPolicy({ compaction: { maxTokens, keepRecent, summarizer } })` — uses the ADK's native compactors with LLM summarization.
- **HITL**: `@Tool({ requiresApproval: true | (input, ctx) => boolean })`. The tool does NOT execute; the run returns `status: "pending_approval"` with `pending[].callId`. Then: `agent.approve({ sessionId, callId })` executes and resumes; `reject()` informs the model without executing.

## Structured output

```ts
@Agent({ name: "reporter", output: reportSchema, outputKey: "report" })
class ReporterAgent extends AdkAgent<typeof reportSchema> {}

const run = await reporter.ask({ message });
run.output; // typed and VALIDATED (safeParse) — OutputValidationError if the model strays from the schema
```

`outputKey` writes the validated output to the session state (the glue for pipelines/sub-agents).

## Sub-agents & Workflows

`subAgents: [OtherAgent]` on `@Agent` (transfer decided by the LLM) or `@WorkflowAgent({ mode: "sequential" | "parallel" | "loop", agents: [...] })` for deterministic orchestration. Workflows are agents too (instance = handle).

## MCP

```ts
imports: [McpModule.forRoot({ servers: [{ name: "fs", transport: { type: "stdio", command: "..." } }] })]

@Agent({ tools: [toolset("fs")] }) // the server's catalog becomes tools (JSON Schema → Zod)
```

Transports: stdio, HTTP, SSE. Catalog cached at boot; connection errors become `McpConnectionError`.

## Logs

Structured logs per agent run, via Nest's `Logger` (context `Adk:<agent_name>`):

```ts
AdkModule.forRoot({ engine: GoogleAdkEngine, logging: "debug" }) // false | true | "info" | "debug" | "verbose"
```

Levels are **cumulative**; each line goes out through the matching `Logger` method (your app's level filter also applies):

| Level | Includes | Nest method |
|---|---|---|
| `false` / omitted | nothing (default) | — |
| `true` = `"info"` | `run start` (session, user, input) and `run done` (duration, final text, tokens) | `logger.log` |
| `"debug"` | info + `tool call` / `tool result` (name + payload) | `logger.debug` |
| `"verbose"` | debug + intermediate `llm response` + **full** payloads (no truncation) | `logger.verbose` |

Anomalies always go out as `warn`: `model rerouted` and `approval required`. Below `"verbose"`, payloads truncate at 160 chars.

```
run start session=smoke-1 user=u1 message=What's the status of my order 123?
tool call lookup_order args={"orderId":"123"}
tool result lookup_order result={"id":"123","status":"shipped","total":250}
run done in 1389ms text=The status of your order 123 is shipped. | tokens in=772 out=41 total=813
```

`tokens in/out/total` come from the provider; `cached=N` shows up when it reports context-cache tokens (e.g. `new Gemini(model, { cache })`). Programmatically: `run.usage` (`promptTokens`, `outputTokens`, `cachedTokens?`, `totalTokens`).

> In tests with `@nestjs/testing`, the logger is silenced by default — re-enable it with `app.useLogger(console)`.

## Observability

The ADK natively emits `gen_ai.*` OTel spans — configure your app's OTel SDK and export via OTLP to Langfuse, Opik, or any backend. The lib imposes no observability contract of its own.

## Embeddings

`Embedder` contract in the core (no default implementation — see the `GeminiEmbedder` example over `@google/genai` in the playground): `embed(texts) → { embeddings, usage: { promptTokens } }`. Configure it in `forRoot({ embedder })`, inject `Embedder` in production (semantic search, dedup) — and the `toBeSemanticallySimilarTo` matcher uses the module's embedder. `Similarity` (cosine) is an exported provider.

## Events & errors

`stream()` delivers the normalized loop: `run_start | tool_call | tool_result | llm_response | model_rerouted | approval_required | final` — every event carries `raw` with the provider's original payload (nothing is discarded). `ask()` aggregates into `RunResult { text, usage, events, status, output?, pending? }`.

Errors are **not events**: they throw typed (`AdkError` with `code`). Invalid config → `AdkBootError` at boot pointing at the class (`UnregisteredToolError`, `ConflictingPromptError`, `ReservedMethodError`...); runtime → `AiEmptyResponseError`, `OutputValidationError`, `ToolExecutionError`, `ModelsExhaustedError`, `ApprovalNotFoundError`...

## Testing

Setup is plain `@nestjs/testing`; the lib only adds what is exclusive to it:

```ts
const module = await Test.createTestingModule({
	imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test-model" })],
	providers: [WeatherAgent, GetWeatherTool, WeatherService, ForecastService],
})
	.overrideProvider(WeatherService).useValue(fakeWeather) // Nest's NATIVE override
	.compile();

const weatherAgent = new TestAgent(module, WeatherAgent); // test handle over the REAL instance
weatherAgent
	.mockCallTool("get_weather", { city: "SP" }) // stacks — nothing executes
	.mockText("It's 25°C in São Paulo.");        // next run consumes the stack (real tools via DI)

const run = await module.get(ForecastService).forecast("SP"); // test YOUR service

expect(run).toHaveCalledTool("get_weather", { city: "SP" });
expect(run).toHaveCalledToolsInOrder(["get_weather"]);
expect(run).toHavePausedForApproval("refund");   // HITL in a matcher
expect(run).toHaveUsedAtMostTokens(1500);        // token budget as a regression
expect(run).toMatchOutput(reportSchema);         // structured output
await expect(run).toBeSemanticallySimilarTo("Your order has shipped.", { threshold: 0.85 });
expect(weatherAgent.lastInstruction()).toMatchSnapshot(); // prompt regression
```

The layers (they all coexist in a real project):

| Test question | Tool |
|---|---|
| Does my tool work? | Pure unit / Nest (`new Tool(dep)`, `overrideProvider`) — no lib. Examples: [support.tools.spec.ts](apps/playground/src/support/support.tools.spec.ts) |
| Does my agent/service behave correctly? | `ScriptedEngine` + `TestAgent.mock*` (the everyday default) |
| Does the ADK integration behave correctly? | `GoogleAdkEngine` + `new TestAgent(...)` (registers a `ScriptedModel` as the agent's model override) — real loop, scripted LLM |
| Does the real model decide well? | `*.agent.spec.ts` suite with Gemini + `expectJudged(text).toSatisfy(rubric, { judge })` |

Matchers via `import "@nestjs-adk/testing/matchers"` (setupFile). Stackable mocks work over `ScriptedEngine` **and** over `ScriptedModel` (real engine).

## Development

```bash
npm install
npm run test             # unit + integration (no real AI)
npm run test:unit        # in-process specs only (*.spec.ts)
npm run test:integration # full app / external processes (*.e2e.spec.ts)
npm run test:agents      # REAL AI — smoke with Gemini (*.agent.spec.ts)
npm run typecheck        # strict tsc
npm run lint             # biome
npm run build            # turbo → rollup (CJS+ESM)
```

## Playground with real AI

Requires `GEMINI_API_KEY` in the root `.env` (default model: `gemini-3.1-flash-lite`, switch with `PLAYGROUND_MODEL`).

### Smoke tests (real Gemini)

```bash
npm run test:agents
```

Runs [apps/playground/src/smoke.agent.spec.ts](apps/playground/src/smoke.agent.spec.ts): real tool calling, multi-turn memory, HITL (pause + `approve()`) and semantic similarity with real embeddings. Without a key in the environment, the tests are **skipped** — CI never breaks.

### ADK Dev UI (`adk web`)

```bash
npm run playground:web
# open http://localhost:4111
```

Starts Google's official Dev UI with the playground's NestJS agents — chat, event inspection and tool-call tracing. To stop it: `lsof -ti:4111 | xargs -r kill -9`.

How it works (and why there is a compile step):

1. `tsc -p apps/playground/tsconfig.web.json` pre-compiles the playground to CJS — `adk web` compiles entries with **esbuild**, which doesn't emit `emitDecoratorMetadata` (Nest's DI would break); `tsc` does.
2. The entry [apps/playground/adk-agents/support/agent.mjs](apps/playground/adk-agents/support/agent.mjs) uses `createAdkEntry(AppModule, SupportAgent)` (`@nestjs-adk/google`): it bootstraps the Nest context (DI resolves tools/prompts/config) and returns the **native** `LlmAgent` the Dev UI consumes.
3. The entry imports everything via `createRequire` (CJS build) — avoiding the *dual-package hazard* (the ESM build's `AgentRunner` class ≠ CJS would break DI resolution).
4. `adk web` runs with `--bundle false --compile false` (the entry is already plain JS).

Versioning via [changesets](https://github.com/changesets/changesets): `npm run changeset` → PR → `npm run version` → `npm run release`.
