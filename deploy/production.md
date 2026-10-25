# One-command deployment (existing Linux server)

From the repository root, run `bash deploy.sh`. It updates **main**, builds images
before replacing containers, starts the seven application services with production
Compose settings, and checks Docker health plus frontend/gateway HTTP responses.
It also requires a successful public product-feed query through the gateway.
Frontend uses `next build` and `next start`. The optional pgAdmin is not started.

Requirements: Git, Docker Compose supporting `!reset`, `flock`, an existing running
database stack, and a valid `.env`. Run as the checkout owner with Docker access
(on the current server: `sudo -i`, then `cd /root/Ise`). Explicit Compose files are
used; an existing `docker-compose.override.yml` is retained and production is last.
The script does not install tools, provision databases, seed demo accounts, delete
volumes, or remove obsolete services automatically. New services/configuration
need a reviewed update to the script/config before deployment.

## Password reset email

auth-service sends forgot-password links by SMTP and **refuses to start** if
`MAIL_TRANSPORT=smtp` is set with incomplete settings. Without `MAIL_TRANSPORT`
the feature is disabled and its endpoints answer 503. Add to the server `.env`:

```
MAIL_TRANSPORT=smtp
APP_BASE_URL=https://re-loop.cskmitl.com   # site origin used in the emailed link; must be https
MAIL_FROM="RE-LOOP <sender@gmail.com>"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=sender@gmail.com
SMTP_PASS=<16-character Google App Password>
```

For Gmail, use a dedicated sender account with 2-Step Verification on, then
create the App Password at https://myaccount.google.com/apppasswords. Never use
the account's real password, and never commit these values. Gmail allows about
500 messages a day; mail from a gmail.com sender may land in spam, which only a
sending domain with SPF/DKIM fixes. `MAIL_TRANSPORT=log` prints live reset links
and is rejected unless `APP_BASE_URL` is localhost.

This release adds the `password_reset_tokens` table, so deploy it with
`bash deploy.sh --migrate`.

## Sign-up email confirmation

With mail configured, new accounts must confirm their email before they can
sign in (`EMAIL_VERIFICATION=required`, the default whenever mail can be
sent). Set `EMAIL_VERIFICATION=off` to keep the old instant sign-in. Asking for
`required` without a working `MAIL_TRANSPORT` stops auth-service at boot.

The `add_email_verification` migration marks every existing account as
verified (from its creation date), so nobody already registered is locked
out; deploy it with `bash deploy.sh --migrate`. Demo seeds create verified
accounts too.

## Database changes

Without `--migrate`, changed Prisma/DB infrastructure files stop deployment before
containers are replaced. Review the changes, then run `bash deploy.sh --migrate`
only when the migrations are appropriate for the existing data. This deliberately
stops application services for a maintenance window, dumps PostgreSQL and MongoDB,
then runs the repository's guarded migrations and Mongo schema push **without**
`--accept-data-loss`. Incompatible legacy Product/Order databases will still be
blocked. A backup does not make an incompatible migration safe. On an initial run,
the operator must verify that the existing databases match the current checkout;
Git cannot infer which version an existing image/schema was built from. After
building, every ordinary run also queries `prisma migrate status` against the
actual Auth/Product/Order/Support databases using the new images. Pending or
failed migrations, incompatible history, and connection errors block replacement
even on the first run or after a manual pull. Inspect the per-service status logs;
`--migrate` requires a successful status check after migrations before startup.
This checks migration history, not arbitrary manual schema drift. MongoDB does
not have Prisma migration history; its schema changes still require review and
`--migrate`. A product-feed HTTP error or invalid JSON shape prevents success from
being recorded; an empty catalog is valid.

## Logs and recovery

`.deploy-state/` contains private per-run logs, `.env` backup, previous commit/image
IDs and tagged rollback images, database backups when migrations are requested,
and the last successful commit. Keep this directory private and monitor disk space;
backup rotation is manual. `DEPLOY_STATE_DIR` can select another persistent path.

Build failure leaves the existing containers serving. If a migration fails,
applications may be stopped and the database may be partly changed: inspect the
logs and use a reviewed recovery procedure. Health failures stop with diagnostics.
The script does not automatically roll back schema or containers, because old
images may be incompatible with a migrated schema. Previous image tags and the
saved configuration support a deliberate rollback after compatibility is checked.

## Current server's local production fix

The previous deployment modified `frontend/Dockerfile.prod` locally on the server.
This commit includes that fix (copy `public`, skip the hanging npm-prune step).
Before the first pull, preserve the server diff and reconcile that one file with
the committed version. The script refuses tracked local changes and never uses
`git reset --hard` or automatic stash. Untracked files colliding with incoming
Git files also cause Git to stop safely. Never add `.env` or backups to Git.

Once this file/script is available on the server, routine deployment is:

```bash
cd /root/Ise
bash deploy.sh
```
