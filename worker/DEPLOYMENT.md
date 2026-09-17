# Shared storage deployment — not yet live

Prepared on branch `shared-sync`. The published `main` site still uses browser-local storage.

## Prerequisites

- Confirm access policy with Denis. The implementation supports public link-based editing only; default `closed` blocks all data requests. Invited-user access requires adding authentication before publication.
- Cloudflare account, Workers and D1 access. Configure credentials through a protected credential flow, never in frontend files or git.

## Deployment sequence

1. Create D1 database `natcongress-tasks` and replace `SET_DURING_DEPLOYMENT` in wrangler.jsonc.
2. Apply schema.sql to remote D1. Do not seed from a collaborator's stale browser automatically.
3. Set ACCESS_MODE to `public` only if Denis selects editing by anyone with the link. CORS is not authentication.
4. Deploy Worker and put its HTTPS URL in ../config.js.
5. Check create/read/edit/delete and a stale-revision conflict against the deployed API from two browser sessions.
6. Publish index.html and config.js to Pages together only after successful verification.
7. Denis opens the page in the browser where he edited tasks and uses «Перенести мои задачи». The app downloads a backup and asks before adding/updating shared tasks. Original localStorage is left unchanged. Missing tasks are not deleted; tombstoned IDs cannot be recreated through import.
8. Check a second browser sees his changes within 5 seconds.

## Checks

`node --test tests/shared-api.test.mjs` from repository root exercises the Worker with SQLite: separate client reads, edits, stale edit/delete rejection, deletion tombstones, history and input validation. This is local verification, not a deployed/browser acceptance test.

## Recovery

Export JSON for user backups; D1 history records previous payloads. Do not claim an automated backup policy exists yet. If publication fails, keep main/local-storage version deployed. Local browser edits are not accessible to the deployment agent.
