# nestjs-adk

Framework de agentes de IA **NestJS-native**: decorators, DI e contratos abstratos sobre engines plugáveis — Google ADK como motor principal.

```ts
@Agent({
	name: "support_agent",
	description: "Atendimento.",
	model: "gemini-2.5-flash",
	prompt: "Você é o atendente da loja.",
	tools: [LookupOrderTool],
})
export class SupportAgent extends AdkAgent {}

// consumo — a instância do agente É o handle (DI comum do Nest)
constructor(private readonly support: SupportAgent) {}
const { text } = await this.support.ask({ sessionId, message: "cadê meu pedido?" });
```

O modelo mental inteiro em 3 regras:

1. **`AdkModule.forRoot(...)`** — 1x por app, configura o motor (engine, `defaultModel`, stores, logging, embedder).
2. **`providers: []`** — agente, tool, skill e prompt class são Injectables comuns; registro é Nest puro. Esqueceu uma classe? O boot falha apontando ela (`UnregisteredToolError` etc.).
3. **Consumo** — injete a classe do agente e chame `ask()` / `stream()` / `approve()` / `reject()`.

## Pacotes

| Pacote | Papel |
|---|---|
| [`@nestjs-adk/core`](packages/core) | Decorators, contratos, `AdkModule`, runner, Continuity |
| [`@nestjs-adk/google`](packages/google) | Engine adapter do `@google/adk` (LlmAgent/FunctionTool nativos) |
| [`@nestjs-adk/mcp`](packages/mcp) | Consumo de MCP servers externos como tools |
| [`@nestjs-adk/testing`](packages/testing) | `TestAgent` (mocks empilháveis), `ScriptedEngine`/`ScriptedModel`, matchers Vitest, LLM-as-judge |

Exemplo de consumo real: [apps/playground](apps/playground).

## Módulo

```ts
@Module({
	imports: [
		AdkModule.forRoot({
			engine: GoogleAdkEngine,          // contrato AdkEngine — trocável (ScriptedEngine em testes)
			defaultModel: "gemini-2.5-flash", // string ou classe de model spec; agente pode sobrescrever
			session: PrismaSessionStore,      // contrato SessionStore (default: in-memory)
			artifacts: InMemoryArtifactStore, // contrato ArtifactStore
			prompts: { dir: "./prompts" },    // raiz dos .md
			logging: "debug",                 // ver seção Logs
			embedder: GeminiEmbedder,         // contrato Embedder (sem default — traga o seu)
			context: contextPolicy({ ... }),  // default global de Continuity, overridable por agente
		}),
	],
	providers: [SupportAgent, LookupOrderTool, SupportPrompt, OrdersService, ChatService],
})
export class AppModule {}
```

`forRootAsync({ engine, useFactory, inject })` disponível; a engine é sempre estática (classe). O módulo raiz é global (runner/stores injetáveis em qualquer lugar); os agentes seguem o escopo normal de módulos. O boot valida tudo **fail-fast**: nome duplicado, tool/skill/subAgent/prompt não registrado, agente sem modelo — erro de config explode na subida apontando a classe, nunca em runtime.

## Tools & Skills

**Tool compartilhada → classe** (contrato `AdkTool`, schema Zod = declaração pro modelo + tipagem do input):

```ts
const schema = z.object({ city: z.string().describe("Nome da cidade") });

@Tool({ name: "get_weather", description: "Clima atual.", schema })
export class GetWeatherTool extends AdkTool<typeof schema> {
	constructor(private readonly weather: WeatherService) { super(); }

	execute(input: z.infer<typeof schema>, ctx: ToolContext) {
		// input ← decidido pelo modelo | ctx ← dados da aplicação (userId, attributes, state)
		return this.weather.fetch(input.city); // retorno serializável volta pro LLM
	}
}
```

**Tool exclusiva do agente → método inline** com `@Tool({ description, schema })`. Dados sensíveis (tenantId, userId) **nunca** entram no schema — chegam por `ctx` (`ask({ attributes, state })`), fora do alcance do modelo.

**Skills** são instruções de domínio: `@Skill({ name, description })` em classe (`AdkSkill`) ou método do agente. `mode: "always"` entra sempre na instruction; o default é on-demand (catálogo + tool `load_skill`).

## Prompts

Duas superfícies, cada uma com um significado:

```ts
// A) Direto no @Agent — texto literal OU arquivo .md (campos distintos)
@Agent({ name: "support", prompt: "Você é o atendente da loja." })
@Agent({ name: "support", promptFile: "agents/support/main.prompt.md" }) // via prompts.dir do forRoot
@Agent({ name: "support", promptFile: "./prompts/main.prompt.md" })      // relativo ao arquivo do agente

// B) Builder — classe AdkPrompt (DI plena + dados do run via ask({ attributes, state }))
@Injectable()
class SupportPrompt extends AdkPrompt {
	constructor(private readonly config: SupportConfig) { super(); }
	build(ctx: PromptContext) {
		return this.fromFile("agents/support/main.prompt.md", { tone: this.config.tone, plan: ctx.state.get("plan") });
	}
}
@Agent({ name: "support", prompt: SupportPrompt }) // registrado como provider
```

Templates `.md` usam `{{var}}`, são cacheados em memória (1 leitura por arquivo); `prompt` + `promptFile` juntos falham no boot. A instruction final é composta em ordem determinística (prompt → skills `always` → catálogo on-demand) — prefixo estável para caching implícito do provider. Atenção de build: `.md` precisa ser copiado pro `dist` (assets); em produção prefira `prompts.dir` a caminhos `./` relativos.

## Modelos

`model` (no `@Agent`) e `defaultModel` (no `forRoot`) aceitam `string` ou uma **classe de model spec** — value objects de dado puro; a engine ativa materializa:

```ts
model: "gemini-2.5-flash"
model: new Gemini("gemini-2.5-flash", { vertexai, project, labels, cache: { content }, config })
model: new OpenAiLike("gpt-4o-mini", { baseUrl, apiKeyEnv })  // OpenAI, OpenRouter, Ollama, xAI...
model: new ModelRouter({ targets: { primary: new Gemini("..."), fallback: new OpenAiLike("...") } })
```

- `Gemini` (import canônico: `@nestjs-adk/google`): `labels` para billing (Vertex), `cache` para cachedContent explícito, `config` é passthrough livre de `GenerateContentConfig`.
- `ModelRouter`: failover na ordem declarada quando o alvo falha antes do 1º chunk (ex.: 429); cada reroute vira evento `model_rerouted`. Como `defaultModel`, é failover global em 1 linha.
- Labels por run: `ask({ labels })`.

## Sessões & Continuity

- `sessionId` presente → sessão **persistente** via `SessionStore` (contrato com `get/create/append/updateState` — implemente com Prisma/Postgres etc.; default in-memory). `sessionId` omitido → efêmera.
- O `SessionStore` é o **system of record**: a engine re-hidrata o contexto a partir do histórico a cada run.
- **Offload automático**: resultado de tool acima de 20k chars vira artifact (`ArtifactStore`) e o modelo recebe um resumo + tool `read_artifact` para consultar sob demanda (opt-out por tool: `offload: false`).
- **Compaction**: `context: contextPolicy({ compaction: { maxTokens, keepRecent, summarizer } })` — usa os compactors nativos do ADK com sumarização por LLM.
- **HITL**: `@Tool({ requiresApproval: true | (input, ctx) => boolean })`. A tool NÃO executa; o run retorna `status: "pending_approval"` com `pending[].callId`. Depois: `agent.approve({ sessionId, callId })` executa e retoma; `reject()` informa o modelo sem executar.

## Structured output

```ts
@Agent({ name: "reporter", output: reportSchema, outputKey: "report" })
class ReporterAgent extends AdkAgent<typeof reportSchema> {}

const run = await reporter.ask({ message });
run.output; // tipado e VALIDADO (safeParse) — OutputValidationError se o modelo fugir do schema
```

`outputKey` grava o output validado no state da sessão (cola de pipelines/sub-agents).

## Sub-agents & Workflows

`subAgents: [OtherAgent]` no `@Agent` (transferência decidida pelo LLM) ou `@WorkflowAgent({ mode: "sequential" | "parallel" | "loop", agents: [...] })` para orquestração determinística. Workflows também são agentes (instância = handle).

## MCP

```ts
imports: [McpModule.forRoot({ servers: [{ name: "fs", transport: { type: "stdio", command: "..." } }] })]

@Agent({ tools: [toolset("fs")] }) // catálogo do server vira tools (JSON Schema → Zod)
```

Transportes: stdio, HTTP, SSE. Catálogo cacheado no boot; erros de conexão viram `McpConnectionError`.

## Logs

Logs estruturados por execução de agente, via `Logger` do Nest (contexto `Adk:<nome_do_agente>`):

```ts
AdkModule.forRoot({ engine: GoogleAdkEngine, logging: "debug" }) // false | true | "info" | "debug" | "verbose"
```

Níveis **cumulativos**; cada linha sai no método correspondente do `Logger` (o filtro de níveis do seu app também se aplica):

| Nível | Inclui | Método Nest |
|---|---|---|
| `false` / omitido | nada (default) | — |
| `true` = `"info"` | `run start` (session, user, input) e `run done` (duração, texto final, tokens) | `logger.log` |
| `"debug"` | info + `tool call` / `tool result` (nome + payload) | `logger.debug` |
| `"verbose"` | debug + `llm response` intermediárias + payloads **inteiros** (sem truncar) | `logger.verbose` |

Anomalias sempre saem como `warn`: `model rerouted` e `approval required`. Abaixo de `"verbose"`, payloads truncam em 160 chars.

```
run start session=smoke-1 user=u1 message=What's the status of my order 123?
tool call lookup_order args={"orderId":"123"}
tool result lookup_order result={"id":"123","status":"shipped","total":250}
run done in 1389ms text=The status of your order 123 is shipped. | tokens in=772 out=41 total=813
```

`tokens in/out/total` vêm do provider; `cached=N` aparece quando ele reporta tokens de cache de contexto (ex.: `new Gemini(model, { cache })`). Programaticamente: `run.usage` (`promptTokens`, `outputTokens`, `cachedTokens?`, `totalTokens`).

> Em testes com `@nestjs/testing`, o logger é silenciado por padrão — reative com `app.useLogger(console)`.

## Observabilidade

O ADK emite spans OTel `gen_ai.*` nativamente — configure o SDK OTel do seu app e exporte via OTLP para Langfuse, Opik, ou qualquer backend. A lib não impõe contrato próprio de observabilidade.

## Embeddings

Contrato `Embedder` no core (sem implementação default — exemplo `GeminiEmbedder` sobre `@google/genai` no playground): `embed(texts) → { embeddings, usage: { promptTokens } }`. Configure em `forRoot({ embedder })`, injete `Embedder` em produção (busca semântica, dedup) — e o matcher `toBeSemanticallySimilarTo` usa o mesmo embedder do módulo. `Similarity` (cosseno) é provider exportado.

## Eventos & erros

`stream()` entrega o loop normalizado: `run_start | tool_call | tool_result | llm_response | model_rerouted | approval_required | final` — todo evento carrega `raw` com o payload original do provider (nada é descartado). `ask()` agrega em `RunResult { text, usage, events, status, output?, pending? }`.

Erros **não são eventos**: estouram tipados (`AdkError` com `code`). Config inválida → `AdkBootError` no boot apontando a classe (`UnregisteredToolError`, `ConflictingPromptError`, `ReservedMethodError`...); runtime → `AiEmptyResponseError`, `OutputValidationError`, `ToolExecutionError`, `ModelsExhaustedError`, `ApprovalNotFoundError`...

## Testes

Setup é `@nestjs/testing` puro; a lib só adiciona o que é exclusiva dela:

```ts
const module = await Test.createTestingModule({
	imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test-model" })],
	providers: [WeatherAgent, GetWeatherTool, WeatherService, ForecastService],
})
	.overrideProvider(WeatherService).useValue(fakeWeather) // override NATIVO do Nest
	.compile();

const weatherAgent = new TestAgent(module, WeatherAgent); // handle de teste sobre a instância REAL
weatherAgent
	.mockCallTool("get_weather", { city: "SP" }) // empilha — nada executa
	.mockText("Faz 25°C em São Paulo.");         // próximo run consome a pilha (tools reais via DI)

const run = await module.get(ForecastService).forecast("SP"); // testa o SEU serviço

expect(run).toHaveCalledTool("get_weather", { city: "SP" });
expect(run).toHaveCalledToolsInOrder(["get_weather"]);
expect(run).toHavePausedForApproval("refund");   // HITL num matcher
expect(run).toHaveUsedAtMostTokens(1500);        // orçamento de tokens como regressão
expect(run).toMatchOutput(reportSchema);         // structured output
await expect(run).toBeSemanticallySimilarTo("Seu pedido foi enviado.", { threshold: 0.85 });
expect(weatherAgent.lastInstruction()).toMatchSnapshot(); // regressão de prompt
```

As camadas (todas convivem num projeto real):

| Pergunta do teste | Ferramenta |
|---|---|
| Minha tool funciona? | Unitário puro / Nest (`new Tool(dep)`, `overrideProvider`) — sem lib. Exemplos: [support.tools.spec.ts](apps/playground/src/support/support.tools.spec.ts) |
| Meu agente/serviço se comporta certo? | `ScriptedEngine` + `TestAgent.mock*` (default do dia a dia) |
| A integração com o ADK se comporta certo? | `GoogleAdkEngine` + `new TestAgent(...)` (registra um `ScriptedModel` como override do agente) — loop real, LLM roteirizado |
| O modelo real decide bem? | Suíte `*.agent.spec.ts` com Gemini + `expectJudged(text).toSatisfy(rubrica, { judge })` |

Matchers via `import "@nestjs-adk/testing/matchers"` (setupFile). Mocks empilháveis funcionam sobre `ScriptedEngine` **e** sobre `ScriptedModel` (engine real).

## Desenvolvimento

```bash
npm install
npm run test             # unit + integração (sem IA real)
npm run test:unit        # só specs in-process (*.spec.ts)
npm run test:integration # app completo / processos externos (*.e2e.spec.ts)
npm run test:agents      # IA REAL — smoke com Gemini (*.agent.spec.ts)
npm run typecheck        # tsc strict
npm run lint             # biome
npm run build            # turbo → rollup (CJS+ESM)
```

## Playground com IA real

Requer `GEMINI_API_KEY` no `.env` da raiz (modelo default: `gemini-3.1-flash-lite`, troque com `PLAYGROUND_MODEL`).

### Smoke tests (Gemini real)

```bash
npm run test:agents
```

Roda [apps/playground/src/smoke.agent.spec.ts](apps/playground/src/smoke.agent.spec.ts): tool calling real, memória multi-turn, HITL (pausa + `approve()`) e similaridade semântica com embeddings reais. Sem key no ambiente, os testes são **pulados** — CI nunca quebra.

### ADK Dev UI (`adk web`)

```bash
npm run playground:web
# abra http://localhost:4111
```

Sobe o Dev UI oficial do Google com os agentes NestJS do playground — chat, inspeção de eventos e trace de tool calls. Para derrubar: `lsof -ti:4111 | xargs -r kill -9`.

Como funciona (e por que existe um passo de compilação):

1. `tsc -p apps/playground/tsconfig.web.json` pré-compila o playground para CJS — o `adk web` compila entries com **esbuild**, que não emite `emitDecoratorMetadata` (a DI do Nest quebraria); o `tsc` emite.
2. O entry [apps/playground/adk-agents/support/agent.mjs](apps/playground/adk-agents/support/agent.mjs) usa `createAdkEntry(AppModule, SupportAgent)` (`@nestjs-adk/google`): bootstrapa o contexto Nest (DI resolve tools/prompts/config) e devolve o `LlmAgent` **nativo** que o Dev UI consome.
3. O entry importa tudo via `createRequire` (build CJS) — evita o *dual-package hazard* (a classe `AgentRunner` do build ESM ≠ CJS quebraria a resolução na DI).
4. `adk web` roda com `--bundle false --compile false` (o entry já é JS puro).

Versionamento via [changesets](https://github.com/changesets/changesets): `npm run changeset` → PR → `npm run version` → `npm run release`.
