// Pulls in @types/jest's ambient globals (describe/it/expect/jest/...) for
// *.test.ts files. tsc doesn't auto-include node_modules/@types/jest on its
// own in this project's tsconfig setup, so without this reference every
// *.test.ts file fails to compile with "Cannot find name 'describe'" etc.
// A single reference is enough for the whole program since these are
// ambient (non-module) global declarations, not per-file imports.
/// <reference types="jest" />
