# Local development

Install Docker with Compose supporting `--wait`, and the Node/npm versions in
package.json. Copy `.env.example` to `.env` and configure local values, then run:

```sh
npm run dev
```

This starts the database stack and Mongo replica initializer, waits for database
health, builds application images (including Prisma Client generation), stops
existing apps, creates any missing configured PostgreSQL databases, runs guarded
PostgreSQL migrations and Mongo schema push without
data-loss flags, seeds missing demo fixtures, then starts the applications.
Subsequent runs apply new migrations and preserve existing fixtures; demo reset
is explicitly disabled. Ctrl+C stops the attached application containers.

The default PostgreSQL initializer creates the database names in `.env.example`
on an empty volume. Bootstrap also creates missing database names from the four
PostgreSQL services' effective Compose `DATABASE_URL` settings, using their configured
database users as owners. Those URLs must target `postgres:5432`, and the database
users must already exist. Existing databases are retained. This command does
not delete volumes, reset schemas, or convert incompatible legacy
databases. A migration failure stops bootstrap before seeds/application startup.
Read its error, preserve the database, and review a compatible migration or use a
separate fresh development database. Back up valuable data before schema changes.

For production use `bash deploy.sh`, which provides backups and deployment
checks. `npm run dev` refuses a production frontend Compose configuration.
