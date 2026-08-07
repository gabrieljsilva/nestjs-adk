---
"@nestjs-adk/core": minor
---

An agent can build its prompt per run, with everything it has injected.

`@Agent({ prompt })` still declares a fixed text. What is new is overriding `prompt()`, for an instruction that depends on data:

```ts
@Agent({ name: "support", description: "..." })
export class SupportAgent extends AdkAgent {
	public constructor(private readonly customers: FindCustomerUseCase) {
		super();
	}

	protected override async prompt(context: PromptContext): Promise<string> {
		const customer = this.customers.execute(context.owner?.value ?? "");
		return this.prompting.renderFromFileOrFail("support.md", { name: customer.name });
	}
}

await support.ask("where is my order?", { owner: user.email });
```

The agent is an ordinary provider, so the repository that knows the customer is a constructor argument. That is the point of the shape: the data reaches the system prompt instead of being concatenated into the user's message, which is the one place a model has been told to treat text as somebody else's words.

`this.prompting` answers three things. `render(template, vars)` interpolates text the agent already has, so prompts kept in a database need no port at all. `renderFromFile(path, vars)` answers `undefined` when there is no such prompt, and `renderFromFileOrFail(path, vars)` throws naming the path the source resolved.

`{{name}}` is optional and renders as nothing. `{{{name}}}` is required, and a prompt missing one fails naming every missing key at once. `null` counts as missing for both, because a column nobody filled says the same thing as an argument nobody passed.

Prompts are files by default, read once and served from memory, from `./prompts` or from the directory named in `prompts: { dir }`. Implement `PromptSource` and pass `promptSource` to serve them from anywhere else. Declaring both is refused, since `prompts.dir` configures the source the other one replaces.

Replacing the source changes nothing about the agents: they pass a name and never a location, so the same `renderFromFileOrFail("support.md")` reads a bucket or a table, with the connection inside the source. Three things are the source's own, and a remote one needs all three. Caching, since nothing above the port remembers anything and `load` is called once per run: `PromptFileCache` is exported for it. Failure, since whatever `load` throws ends the run, which is deliberate and is where a source that prefers a stale copy decides so. And construction, since `promptSource` takes an instance rather than a provider token.

`PromptContext` carries the session id, the run id, the agent about to answer, the session's owner and the run's signal. The owner is the session's rather than the call's, so a conversation continued tomorrow builds for the same person it was opened for, and `AskOptions.owner` is how it is set when the session starts.

A prompt built per run is a prompt the provider cannot cache: the system prompt is the head of the prefix, and this repository measured 3031 of 3751 prompt tokens coming back cached, worth 68% of that run's input bill. Keep the variable part small and stable within a session: a customer name is fine, a timestamp is not. It is resolved once per agent per run, before the first turn, and a transfer or a delegation resolves the prompt of whoever took over.

Declaring `@Agent({ prompt })` and overriding `prompt()` on the same agent fails at boot. Two prompts is an ambiguity, and any precedence rule would leave one declaration reading like a configured prompt the model never received.

`AdkAgent.approve` and `AdkAgent.reject` now reach the same options object the handle takes, so a decision made through the class can declare the tool sources the resumed run needs. A plain name still works where the options object goes.
