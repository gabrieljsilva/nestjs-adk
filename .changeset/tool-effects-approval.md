---
"@nestjs-adk/core": major
"@nestjs-adk/mcp": major
---

Tools declare what they do; policy decides what pauses.

Approval used to be a per-tool flag (`requiresApproval`), which mixed two questions with two different owners: what the tool does to the world (the author knows) and what to do about it (only the caller knows). The flag also never reached MCP tools, so a connected server could delete an issue with no pause at all.

## Breaking

- `@Tool({ requiresApproval })` is gone. Declare `effect: "read" | "write" | "destructive"` instead; unset means `write`. `destructive` means "not recoverable through the same API": deleting, but also sending an email or charging a card.
- The predicate form (`requiresApproval: (input) => ...`) has no replacement. Value-conditional approval may come back later as an additive feature; today the policy is per run, not per argument.
- The approval gate now covers every tool the model can call, including tools from sources (MCP). A source tool without an `effect` counts as `destructive` and, under the default policy, pauses. This is the new default: a third-party server gets no benefit of the doubt. Pass `approval: "none"` in `ask()` to restore the old behavior for a run.

## Policy per run

`ask({ approval })` maps effect to requirement: `"destructive"` (default) pauses destructive calls, `"write"` pauses write and destructive, `"none"` never pauses. The module can set a different default via `forRoot({ defaults: { approval } })`. The gate reads `effect` on the resolved tool and nothing else, so a decorated class and an MCP tool pause under the same rule.

## MCP annotations

`@nestjs-adk/mcp` derives `effect` from the spec's tool annotations, in both the boot catalog (`McpClient`) and per-run sources (`AdkMcpServer`): `readOnlyHint: true` is `read`; `destructiveHint: false` is `write`; anything else, including no annotations, is `destructive`, which follows the spec's own defaults. Annotations are written by the server, so `AdkMcpServer` accepts `trustAnnotations: false` to ignore them and treat every tool from that server as `destructive`.

## Approving a source tool

`approve()` now resumes a paused source tool. Pass `sources` again, the same way `ask()` received them: the library keeps no credentials and the original connection is closed, so whoever resumes reopens the source. The approved call runs without the gate; the resumed turn is a new run, so a fresh call of the same tool pauses again.
