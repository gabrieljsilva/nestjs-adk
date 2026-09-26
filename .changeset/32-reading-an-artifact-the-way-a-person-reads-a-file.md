---
"@nestjs-adk/core": minor
---

Reading an artifact the way a person reads a file: by line, case insensitively, counted honestly, outlined by what it is, and sliced when it is a table.

## `read_artifact` reads by line

`search_artifact` always answered with the line of each match, and `read_artifact` only took a character offset, so the model was handed a number it could use for nothing. `fromLine` and `lines` close that: `read_artifact({ artifactId, fromLine: 212, lines: 40 })` answers the lines, `totalLines`, and `nextLine` when there are more. `limit` still caps the characters, so one long line cannot blow the budget.

## `search_artifact` grows three things and loses one lie

- `caseSensitive: false` finds `Error` with `error`. It is the one flag the model may ask for; `RegexGuard` still builds the expression.
- `mode`: `excerpts` as before, `lines` for the whole line of each match, which is what a grep shows, and `count` for the number alone, spending nothing on excerpts.
- `totalMatches` counts every occurrence, up to `SearchArtifactTool.MAX_COUNTED_MATCHES` (10 000), and `countStopped` says when it hit that. Before, both the literal and the pattern search stopped at a hundred, so an artifact with two hundred hits reported exactly a hundred as the total.

## `outline_artifact` knows a table and a document

The outline is decided by parsing, in the order JSON, CSV, Markdown, text, and never by the declared type. A CSV answers its columns, each with a type read from its values (`integer`, `number`, `date`, `boolean`, `text`, `empty`), how many were blank and a sample, plus the row count. A Markdown document answers its headings with their level and line, which is the table of contents that makes a long one navigable. Quotes, escaped quotes and line breaks inside a quoted cell follow RFC 4180.

## `slice_artifact`

A rectangle of a CSV: `fromRow`, `toRow` (1 is the first row under the header) and `columns` by name, in the order named. A slice and never a query, for the same reason `query_artifact` takes a pointer and not a JSONPath: there is no filter and no expression, so a string the model wrote cannot compute anything. A column that is not there is refused with the list of the ones that are; text that does not read as a table is refused pointing at `read_artifact`.

The placeholder and `list_artifacts` name it beside the other four.
