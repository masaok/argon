# Repository Guidance

This repository is an open source project. Contributions should be clear,
maintainable, and aligned with security standards expected of public software.

## Engineering Standards

- Keep changes focused on the requested behavior and consistent with existing
  project structure, naming, and tooling.
- Prefer simple, explicit implementations over unnecessary abstraction.
- Do not commit generated artifacts, local environment files, secrets, or
  machine-specific configuration.
- Preserve user data and avoid destructive operations unless explicitly
  requested.

## Security Expectations

- Treat security-sensitive changes with additional care. Favor secure defaults,
  least privilege, input validation, and clear error handling.
- Never expose credentials, tokens, private keys, database contents, or local
  environment values in code, logs, tests, or documentation.
- When adding dependencies, consider maintenance status, supply-chain risk, and
  whether the dependency is necessary.

## Validation

- Run the most relevant checks before finishing a change. For this pnpm
  workspace, `pnpm build` is the baseline validation command.
- For Docker-related changes, verify with `docker compose build` or
  `docker compose up` as appropriate.
- If validation cannot be run, document the reason and the residual risk.
