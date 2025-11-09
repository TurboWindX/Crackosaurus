Security and Secrets

This repository must not contain any production secrets or credentials.

Guidance for maintainers:

- Never commit AWS access keys, private keys, passwords, or other secrets.
- Use environment variables, AWS Secrets Manager, or SSM Parameter Store for secrets in CI/CD and production.
- Keep local/test defaults out of committed source. Use `.env.example` for examples and include real secrets only in `.env` which is listed in `.gitignore`.
- If a secret is accidentally committed, rotate it immediately and remove it from git history using `git filter-repo` or BFG.

Local Development:

- For LocalStack use, it's acceptable to use non-sensitive credentials like `test/test` locally; keep these in `.env.local` (ignored by git) and reference them from `docker-compose.yml`.

If you find sensitive data in the repo, contact the owner and rotate any exposed credentials immediately.
