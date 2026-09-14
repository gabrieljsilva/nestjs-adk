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
