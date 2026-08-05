# nestjs-adk

**Build AI agents the NestJS way.**

NestJS gave Node.js developers a clear way to build servers: modules, providers and dependency injection. The AI ecosystem grew somewhere else, with its own tools and its own patterns. If you love NestJS and want to ship AI agents, you end up gluing two worlds together by hand.

nestjs-adk was born to close that gap. It brings AI agents into the heart of NestJS. An agent is a class with a decorator. A tool is a provider with real dependency injection. Your agent is tested with the same testing tools you already use. Nothing about your architecture needs to change.

```ts
@Agent({
	name: "support_agent",
	description: "Customer support.",
	model: "gemini-2.5-flash",
	prompt: "You are the store's support agent.",
	tools: [LookupOrderTool],
})
export class SupportAgent extends AdkAgent {}
```

And to use it, you inject it like any other class:

```ts
@Injectable()
export class ChatService {
	constructor(private readonly support: SupportAgent) {}

	async answer(sessionId: string, message: string) {
		const { text } = await this.support.ask({ sessionId, message });
		return text;
	}
}
```

Under the hood, your agents run on a real agent engine. The first supported engine is the [Google ADK](https://google.github.io/adk-docs/), so you get a production agent loop, tool calling, sessions, streaming and OpenTelemetry tracing for free. The engine is a contract, so the framework is not locked to one vendor.

## Packages

| Package | What it is |
|---|---|
| [`@nestjs-adk/core`](packages/core) | The framework itself. Decorators, module, contracts, sessions, prompts, models, human approval, structured output, cost tracking. Start here: the main documentation lives in this package. |
| [`@nestjs-adk/google`](packages/google) | The Google ADK engine. Translates your agents into native ADK objects at runtime, including support for Gemini, Vertex AI and the `adk web` Dev UI. |
| [`@nestjs-adk/openai`](packages/openai) | OpenAI models over the official SDK, with a configurable `baseURL` that also reaches OpenRouter, Ollama, Groq, Together and vLLM. |
| [`@nestjs-adk/mcp`](packages/mcp) | MCP client. Connects your agents to external MCP servers and turns their catalogs into agent tools. |
| [`@nestjs-adk/testing`](packages/testing) | Testing utilities. A scripted fake LLM, stackable mocks, Vitest matchers and an LLM-as-judge helper. |

## Getting started

```bash
npm i @nestjs-adk/core @nestjs-adk/google
```

Then read the [`@nestjs-adk/core` documentation](packages/core). It walks through the whole framework in order: module setup, agents, tools, prompts, models, sessions, approvals, structured output, cost and testing.

A complete working app lives in [apps/playground](apps/playground), including smoke tests that talk to the real Gemini API.

## Development

This is a monorepo managed with npm workspaces and Turborepo.

```bash
npm install
npm run test             # unit + integration (no real AI)
npm run test:agents      # real AI smoke tests (needs GEMINI_API_KEY)
npm run typecheck
npm run lint
npm run build
```

Versioning and releases use [changesets](https://github.com/changesets/changesets). Every merge to `main` with a pending changeset opens a version PR; merging that PR publishes to npm automatically.

## About this project

nestjs-adk was built largely with [Claude Code](https://claude.com/claude-code), out of problems I ran into using Google ADK, Cline ADK and agents wired by hand: the run loop, cost, tool declaration, MCP registration, context and prompt management, skills as a first-class tool, event dispatch. Each of those was being solved from scratch every time, so the library turned them into one set of conventions.

The core is mostly AI-written, and the tools I believe a good ADK must have are already in place. The current focus is bugs, code quality, performance and DX. DX drives the design, so expect several major releases with breaking changes, always following semver strictly. This is not an attempt to compete with Google ADK or Cline ADK: it is an agent toolkit that feels native to NestJS, on top of engines that already do the heavy lifting.

Experienced developers are very welcome to open the code and push back on it. The longer version is in the [core README](packages/core#about-this-project).

## License

MIT
