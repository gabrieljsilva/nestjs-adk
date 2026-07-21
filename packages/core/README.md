# @nestjs-adk/core

**NestJS-native** AI agent framework: decorators (`@Agent`, `@Tool`, `@Skill`, `@WorkflowAgent`), DI and abstract contracts over pluggable engines. The agent instance is the execution handle — inject the class and call `ask()` / `stream()` / `approve()` / `reject()`.

```ts
@Agent({
	name: "support_agent",
	description: "Customer support.",
	model: "gemini-2.5-flash",
	prompt: "You are the store's support agent.",
	tools: [LookupOrderTool],
})
export class SupportAgent extends AdkAgent {}

// anywhere in your app — plain Nest DI
constructor(private readonly support: SupportAgent) {}
const { text } = await this.support.ask({ sessionId, message: "where is my order?" });
```

Includes: fail-fast boot validation, prompts (literal, `.md` files or `AdkPrompt` builder classes), model specs (`OpenAiLike`, `ModelRouter` with failover), sessions with pluggable `SessionStore`, automatic artifact offload, native compaction, HITL approvals, structured output validation, leveled run logs with token usage, and an `Embedder` contract.

Pair it with an engine — [`@nestjs-adk/google`](https://www.npmjs.com/package/@nestjs-adk/google) — and, for tests, [`@nestjs-adk/testing`](https://www.npmjs.com/package/@nestjs-adk/testing).

```bash
npm i @nestjs-adk/core @nestjs-adk/google
```

Full documentation: [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk)
