---
"@nestjs-adk/mcp": patch
---

The digest separator is a unicode escape instead of a literal NUL byte, and three option types carry docs.

`credentialDigest` joins its parts with a byte no credential can contain, so `("a", "bc")` and `("ab", "c")` cannot hash the same. That byte was written literally in the source, which made every tool that sniffs for binary content treat the whole file as binary: `grep` matched nothing in it and `git diff` refused to show it. It is now the escape, which is the same value at runtime, and the reason is recorded next to it.

`McpTransportConfig`, `McpTokens` and `McpClientInfo` gained the JSDoc the rest of the package already had.

Two comments that outlived the module they described are corrected. Both said the target guard did not apply to a server declared at boot, which stopped being true when `McpModule` was replaced: every `AdkMcpServer` is checked, wherever it was declared, so `allowPrivateNetwork` is what an internal server needs even though the developer wrote its URL.
