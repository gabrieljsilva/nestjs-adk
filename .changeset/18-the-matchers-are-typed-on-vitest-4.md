---
"@nestjs-adk/testing": patch
---

The matchers type-check on vitest 4.

The augmentation in `@nestjs-adk/testing/matchers` was aimed at `Assertion` on the `vitest` module. Since vitest 4 that name is only re-exported from `@vitest/expect`, and an augmentation aimed at a re-export merges into nothing: every `expect(x).toHaveRunTool(...)` ran and passed while `tsc` reported that the property did not exist. The block now extends `Matchers<T>`, which vitest folds into both `Assertion` and `AsymmetricMatchersContaining`, so the separate asymmetric block is gone with it. Nothing changes at runtime.
