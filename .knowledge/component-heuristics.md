---
title: Component heuristics
description: The four numbers that open a design question about a class, and why line count is not one of them
type: convention
tags: [core, architecture, review]
---

Four measurements are alerts. An alert is a question to answer in review, not a verdict: each one has a legitimate case, and the answer is sometimes "this is right".

**A constructor with more than 6 parameters.** The class is coordinating more collaborators than one responsibility needs. Usually it is holding logic that belongs one layer inward, see [[layered-responsibilities]]. Move the logic first and the arity drops on its own. Splitting the constructor before moving the logic just spreads the same class over two files.

**A class with more than 6 public methods.** The class is the API of more than one thing. A module service is allowed to be near the line, because it is deliberately the one door onto a module, see [[module-boundaries]]. A collaborator is not.

**A folder with more than 12 loose production files.** The folder has stopped being a map of what it contains. Group by concept into subfolders. The count excludes specs, because a spec sits beside the file it covers and doubling the listing is the price of that.

**Dirty code in an outer layer.** A `for`, a nested `if`, arithmetic, a filesystem call or a network call inside an edge or a use case. This one is closest to a rule: the fix is always to move it inward, never to leave it and add a comment.

## Line count is never a finding

A file is long because of what it contains, and the two reasons that make it long are opposite. A 400 line class holding four responsibilities is a finding, and the finding is the four responsibilities. A 400 line codec that maps forty fields is one responsibility written out, and splitting it produces two files that are only ever read together.

Measured on 2026-09-14: three files across all packages are over 300 lines. Length was not what the review found wrong with any of them.

## Not every long constructor is the same finding

Phase 6B swept the constructors over six parameters and converted exactly one kind: the ones taking **data the caller assembles**. A command, an options object or a definition is a list of values somebody writes out at the call site, so its parameters become a typed `*Params` or `*Input` object in the same file and the constructor takes one argument. `AgentDefinition`, `AskInput`, `AgentRunCommand`, `ModelRunCommand`, `PrepareContextCommand`, `ApproveInput`, `RejectInput` and `AdkModuleOptions` all went that way; `RuntimeOptions` went further and grouped its eighteen fields into five sub-objects.

The ones left positional are left deliberately, and the alert is answered rather than silenced:

- **Collaborator injection.** `AskAgentUseCase` (12), `ComposeRuntimeUseCase` (12), `DecideApprovalUseCase` (11), `TurnLoop` (9). Nobody writes these by hand outside the composition, and this file's first rule says to move the logic first: phase 6A did, and what is left is the graph. Wrapping the graph in an object renames the problem.
- **Resolved bundles.** `RunScope` (11), `RuntimeServices` (13), `ComposedRun` (11). Being one bundle is the whole point of the class, see [[run-orchestration]]; an input object for a bundle is a bundle with one more layer.
- **Stored shapes.** `JournalRecord` (9), `CheckpointRecord` (8). The parameters are the columns, in the order the codec writes them, and a record has no behaviour to protect.

The test is the same one everywhere else in this file: would naming the arguments prevent a mistake somebody can actually make. At a call site written once, in a file whose job is to write it, it would not.
