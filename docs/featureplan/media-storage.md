# Docker / AWS S3 media storage

## Agreement
- Approved in chat: “start bro”, after the Docker/S3 scope summary.
- Branch: fullcloudstaging. Keep the default Docker-volume behavior; select S3 via root .env.
- Cover product/review media, chat attachments, dispute evidence, KYC documents and report evidence.
- Preserve URLs, validation, image/video processing, authorization and private-file audit behavior.
- No automatic historical-file migration, deployment, AWS provisioning or publishing.

## Route
1. Add a shared storage adapter (Docker filesystem or private S3), including streaming/range reads, deletion and temporary-upload cleanup.
2. Connect public and private upload/read consumers without changing API URLs or access checks.
3. Document configuration in .env.example; test Docker compatibility and mocked S3 consumer paths.

## Acceptance / limits
- Docker remains the default and requires no AWS credentials.
- S3 operations use distinct namespace prefixes; no public ACLs or browser credentials.
- Private reads stay behind existing authorization; video range requests remain supported.
- Invalid configuration and upload failures fail visibly; no silent local fallback.
- AWS-live verification requires actual bucket configuration and permissions, not available for this implementation.

## Delivered
- Shared adapter: `backend/shared/src/mediaStorage.js`, using AWS SDK v3.
- Docker is the default; S3 uses private objects and namespace-scoped keys.
- Existing API URLs and authorization/audit checks are preserved. Public media is streamed by product-service; private media is streamed only after existing access checks.
- S3 uploads that require processing use OS temporary disk; successful persistence removes scratch files. Rejected uploads attempt object rollback and scratch cleanup.
- Compose already passes root `.env` to the backend services. Inspected production-cloud env generation and production-local Secret generation; both carry these values without a new deployment manifest.

## Configuration
Keep `MEDIA_STORAGE_DRIVER=docker` for the existing volume storage. To use AWS, set these in your private root `.env` and recreate/restart backend services with the new environment:

```dotenv
MEDIA_STORAGE_DRIVER=s3
AWS_REGION=ap-southeast-1
S3_BUCKET=your-private-bucket
S3_KEY_PREFIX=reloop
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
```

Use an IAM role or fill both access-key fields; session token is only for temporary credentials. Do not place these values in frontend variables or commit real credentials. Keep S3 Block Public Access enabled. Backend IAM permissions: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` for the configured prefix, plus `s3:ListBucket` on the bucket so missing objects can be distinguished from permission errors. Bucket encryption policies may require additional KMS permissions.

Changing drivers does not copy historical data. Existing files must be copied separately, preserving filenames, under the matching prefix:

| Existing directory / data | S3 namespace under S3_KEY_PREFIX |
| --- | --- |
| product-service/uploads | products/ |
| product-service/review-uploads | reviews/ |
| chat-service/private-attachments | chat-attachments/ |
| order-service/private-evidence | dispute-evidence/ |
| auth-service/private-kyc-documents (excluding report-evidence/) | kyc-documents/ |
| auth-service/private-kyc-documents/report-evidence | report-evidence/ |

No migration was executed. S3 reads do not silently fall back to volume files. Reverting to Docker likewise requires corresponding local files.

## Verification
- Focused Docker/adapter/regression command: 61 passed, 0 failed.
- Final S3 acceptance run (`node --test` over mediaStorage.test.js, s3Uploads.test.js, s3-media.test.js, s3Attachments.test.js and s3-evidence.test.js): 19 passed, 0 failed, no skips. Includes actual SDK request signing and streaming against an isolated local HTTP fixture; no live AWS calls.
- Full unit groups via `npm run test:service -- GROUP --unit`:
  - shared: 80 passed.
  - auth-service: 229 passed, 1 skipped (see coverage/auth-service/junit.xml).
  - chat-service: 128 passed.
  - order-service: 364 passed.
  - product-service: 471 passed, 1 failed. The unchanged `src/features/catalog/categoryFallback.test.js` cannot reach `postgres:5432`; it requires a reachable disposable PostgreSQL instance. Details in coverage/product-service/junit.xml.
- ESLint passed for all changed JavaScript and new test/helper files.
- `git diff --check` and `docker compose config --quiet` passed.
- SDK installation audit reported 0 vulnerabilities.
- Unit runners emitted MaxListeners warnings and existing upstream-notification connection warnings. They did not cause failures in shared/auth/chat/order.

## Continue from here
- Implementation and local storage acceptance checks are complete.
- Live AWS bucket/region/IAM verification remains pending until the operator supplies configuration.
- Full product regression is not green until the PostgreSQL-dependent category test can run successfully.
- No commit, push, deployment, bucket provisioning or file migration was performed for this feature.
