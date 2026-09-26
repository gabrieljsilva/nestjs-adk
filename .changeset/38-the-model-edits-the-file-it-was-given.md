---
"@nestjs-adk/core": minor
---

The model edits the file it was given, and every ambiguous edit is refused instead of guessed.

`EditArtifactTool` is a seventh runtime artifact tool, opt in like the five that explore. It changes a text artifact in place, keeping its id, so the placeholder the conversation already wrote still points at the file the model just corrected. It takes `edits`, one string holding one or more git conflict style blocks, the format Aider and Cline use, so a model has seen it before:

```text
<<<<<<< SEARCH
	const timeout = 30;
=======
	const timeout = 120;
>>>>>>> REPLACE
```

```ts
@Agent({ name: "importer", description: "...", tools: [OutlineArtifactTool, SliceArtifactTool, EditArtifactTool] })
```

Matching is exact and never fuzzy, indentation and line endings included. That is the whole design and not a limitation: a fuzzy match finds something near enough, writes there, and reports success, which is how an edit tool corrupts a file in silence. A refusal costs one call and the model can act on it, so every ambiguity comes back as `{ refused: true, reason }` naming the block and saying what to do. A SEARCH section that matches nothing is told matching is exact and that it should read the part it is changing. One that matches more than once is told to extend it with the lines around it until it is unique. An empty one is told the artifact already exists and there is nothing to insert against. A malformed block is named by the line it broke on and shown the shape it should have had.

Occurrences are counted overlapping, because two overlapping positions are two places a person could have meant and collapsing them into one would pick a side. **Nothing is written unless every block applies:** the blocks run in order against a copy in memory, each against the result of the one before it, and `ArtifactStorage.update` is called once after the last one lands. A half applied edit leaves a file in a state nobody wrote. An empty REPLACE section deletes the SEARCH text, and the answer carries the new character count, because the placeholder in an earlier event still quotes the old one.

It declares `ToolEffect.WRITE`, and that now means something, because no tool is exempt from the approval policy any more. An application whose policy holds writes holds this tool, and the change waits for a person with no code beyond the policy it already wrote:

```ts
runtime: RuntimeOptions.from({ tools: { approvals: EffectApprovalPolicy.from(ToolEffect.WRITE) } });
```

It is deliberately **not** in `ArtifactExplorationTools`. That group stays the five tools that read. A group named for exploration that quietly carries a write is how an agent ends up able to change a file nobody meant to give it, so an agent that should edit lists `EditArtifactTool` and says so in the one place a reviewer looks.
