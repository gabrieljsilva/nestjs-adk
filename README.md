# nestjs-adk

**Build AI agents the NestJS way.**

NestJS gave Node.js developers a clear way to build servers: modules, providers and dependency injection. The AI ecosystem grew somewhere else, with its own tools and its own patterns. If you love NestJS and want to ship AI agents, you end up gluing two worlds together by hand.

nestjs-adk was born to close that gap. It brings AI agents into the heart of NestJS. An agent is a class with a decorator. A tool is a provider with real dependency injection. Your agent is tested with the same testing tools you already use. Nothing about your architecture needs to change.

```ts
@Agent({
	name: "support",
	description: "Customer support: order status and returns.",
	prompt: "You are the store's support agent. Answer in at most two sentences.",
	tools: [LookupOrderTool],
})
export class SupportAgent extends AdkAgent {}
```

And to use it, you inject it like any other class:

```ts
@Injectable()
export class ChatService {
	public constructor(private readonly support: SupportAgent) {}

	public async answer(sessionId: string, message: string): Promise<string> {
		const result = await this.support.ask(message, { sessionId });
		return result.text;
	}
}
```

The run loop is this library's own: turns, tool calls, transfers, delegation, approvals, compaction, cost. A provider package only translates one request and one stream, which is why adding a provider is a small class and not a port of the framework.

## Packages

| Package | What it is |
|---|---|
| [`@nestjs-adk/core`](packages/core) | The framework itself: decorators, module, run loop, prompts, sessions, tools, approvals, context, cost. Start here, the full documentation lives in this package |
| [`@nestjs-adk/google`](packages/google) | `GeminiModel` and `GeminiEmbedder`, for the Gemini API and Vertex AI |
| [`@nestjs-adk/openai`](packages/openai) | `OpenAiModel`, which also reaches OpenRouter, Ollama, Groq, Together and vLLM through `baseURL` |
| [`@nestjs-adk/mcp`](packages/mcp) | `AdkMcpServer`: an MCP server's catalog as tools an agent can call, with auth and an SSRF guard |
| [`@nestjs-adk/testing`](packages/testing) | A scripted model, doubles over real tool instances, Vitest matchers and an LLM as judge |

## Getting started

```bash
npm i @nestjs-adk/core @nestjs-adk/google
```

Then read the [`@nestjs-adk/core` documentation](packages/core). It walks through the framework in the order you build one: the module, the agent, tools, prompts, models, sessions, limits, context, approvals, streaming and cost. Every name the package exports is documented there, in the guide or in its API reference.

A complete working app lives in [apps/playground](apps/playground), including smoke tests that talk to the real Gemini API.

## Development

This is a monorepo managed with npm workspaces and Turborepo.

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

Tests are split by what they cover and what they cost. The library and the application that exercises it are separate projects, so a red suite says which of the two broke:

```bash
npm run test                    # the library: unit + integration, no real AI
npm run test:playground         # the example application: unit + end to end, no real AI
npm run test:playground:agents  # the example application against a real provider (needs GEMINI_API_KEY)
```

A suffix decides the level: `*.e2e.spec.ts` boots the whole thing, `*.ai.spec.ts` spends money on a real provider, everything else is a unit test. Add a path to run part of a project, as in `npm run test:playground -- apps/playground/src/catalog`.

The library has no provider suites of its own. What it does against a real model is proved through the example application, where the thing under test is the API an application actually writes.

Versioning and releases use [changesets](https://github.com/changesets/changesets). Every merge to `main` with a pending changeset opens a version PR; merging that PR publishes to npm automatically.

## About this project

nestjs-adk was built largely with [Claude Code](https://claude.com/claude-code), out of problems I ran into using Google ADK, Cline ADK and agents wired by hand: the run loop, cost, tool declaration, MCP registration, context and prompt management, skills as a first-class tool, event dispatch. Each of those was being solved from scratch every time, so the library turned them into one set of conventions.

The core is mostly AI-written, and the tools I believe a good ADK must have are already in place. The current focus is bugs, code quality, performance and DX. DX drives the design, so expect several major releases with breaking changes, always following semver strictly. This is not an attempt to compete with Google ADK or Cline ADK: it is an agent toolkit that feels native to NestJS.

Experienced developers are very welcome to open the code and push back on it. The longer version is in the [core README](packages/core#about-this-project).

## License

MIT
