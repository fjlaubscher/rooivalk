---
applyTo: '**'
---
Coding standards, domain knowledge, and preferences that AI should follow.---
applyTo: '**'
---
This bot is written in TypeScript using Node.js and discord.js, with modular architecture. Follow these conventions:

## General Style

- Use modern TypeScript (ESNext features).
- Strict mode must remain enabled in `tsconfig.json`.
- Prefer named exports from modules.
- Use `const` by default; use `let` only when reassignment is necessary.
- Use `async/await`; avoid `.then()` chains unless necessary for control flow clarity.

## Formatting

- Use Prettier defaults (2-space indent, semicolons, no trailing commas).
- Group imports by origin: Node.js, external packages, internal files.
- Always include type annotations on function arguments and return values unless inferred clearly.

## Error Handling

- Wrap all async functions interacting with Discord or OpenAI in try/catch blocks.
- Use clear, descriptive error messages with enough context for debugging.

## OpenAI Integration

- Prompts and completion logic must be modular.
- Avoid inline prompt strings in handlers; use reusable template functions.
- Never log raw completions that might include user data.

## Environment

- Access secrets using `process.env` only.
- Never commit `.env` or hardcoded keys.

## Package Management

- Use Yarn (`yarn install`, `yarn add`, `yarn remove`).
- Keep dependencies minimal and scoped.
