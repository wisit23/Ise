# CI/CD commissioning — 2026-11-03

## Approved constraints

- Validate changes on `staging` before promoting the same commit to `main`.
- Keep Sharp 0.34.5 for the production VM CPU. Only the three approved advisory exceptions in `scripts/ci/release-audit-policy.json` are allowed; other high/critical findings remain blocked.
- GitHub-hosted runners build images. The production VM pulls approved immutable release requests; it has no Actions runner or GitHub credential.
- Deploy without database migrations. Keep HTTPS/API/chat polling checks mandatory; report the known external WebSocket proxy failure as a warning.

## Verified engineering results

- Commit `854f707f97e62d607e94576144071381c46ac912` corrected workspace dependency resolution in backend runtime paths.
- The first approved deployment request, [41523593611](https://github.com/wisit23/Ise/actions/runs/41523593611), was published successfully. The VM rejected its Debian product image during native runtime checks, before stopping live applications. Its request is recorded as failed, not retried automatically. The live journal remained `ready`.
- Debian's Sharp 0.34.5 glibc binary requires x86-64-v2, which this VM lacks. Production's existing Alpine/musl Sharp binary works on this CPU.
- Commit `8a2e27e0574fa5898583cee24f050c49654e801c` switches CI/CD images to Node 24 Alpine and checks frontend Sharp image conversion during Docker build.
- [Staging CI 41525374766](https://github.com/wisit23/Ise/actions/runs/41525374766) passed every check, including all seven Docker builds, before this commit was promoted to main.
- An isolated test on the actual VM passed image conversion using Node 24.22.2, Sharp 0.34.5, and libvips 8.17.3 (`ise-sharp-musl-check3.service`, `SHARP_MUSL_OK`, exit success). Earlier sandbox attempts failed on read-only cache/noexec temporary storage; production was unaffected.
- Removed only unused rejected Debian release image references after checking live pods/deployments and deployment journals. Preserved application data, volumes, backups and retained legacy images. Free space returned to approximately 15 GB.

## Delivery status

Completed. [Main CI 41525858083](https://github.com/wisit23/Ise/actions/runs/41525858083) and [release 41526420516](https://github.com/wisit23/Ise/actions/runs/41526420516) passed for `8a2e27e0574fa5898583cee24f050c49654e801c`.

- Reviewed the release artifact ZIP SHA-256 `ba21a0e2dbb9aadf5356b13a3faedf50da0e5a7d6d666539f68aa8473ba66ddb`, manifest contract, source commit and unchanged schema fingerprint.
- [Deploy request 41527122054](https://github.com/wisit23/Ise/actions/runs/41527122054) passed production environment approval and published the immutable request. The VM consumed it and recorded `success` for `production-request-41527122054-1` at 2026-11-03 04:28:53 Bangkok time.
- VM journal is `ready`, and its complete release manifest matches the reviewed manifest. All seven live application image references match their approved digests. All ten deployments have one ready replica.
- Executed native image conversion inside both live frontend and product-service pods: Node 24.22.2, Sharp 0.34.5, libvips 8.17.3, `SHARP_OK` for both.
- Public HTTPS homepage, product feed and Engine.IO polling passed from the VM. The health monitor returned exit 0. Public Socket.IO authentication rejected both missing and invalid tokens with `Unauthorized`.
- `ise-pull.timer` and `ise-smoke.timer` are enabled and active. They check approved requests about every two minutes and public health every five minutes, respectively.
- No migration was run. Read-only Prisma migration-status checks passed before the new applications started. The single-VM application maintenance interval was approximately 21:27:00–21:28:53 UTC; databases stayed running.
- Removed only specifically inventoried unused Docker images and rebuildable APT binary caches. Docker containers, volumes, K3s current/legacy images, application files and backups were preserved. Final free space was 14.09 GiB, passing the 14 GiB initial pull guard at the time of inspection. This margin is small: if space falls below the guard later, a future deploy will stop before downtime until unused cache is reviewed and cleared.

## Next deployment

1. Push changes to `staging` and wait for all checks.
2. Promote the checked commit to `main`; wait for main CI and Release images.
3. Run **Deploy release** from main with the successful release run ID, `mode=promote`, and `migrate=false` unless a separate migration procedure is reviewed.
4. Review and approve the `production` environment request. Confirm actual success in the VM journal; a green request-publication workflow alone is insufficient.

## Limits

- The university nginx proxy still blocks WebSocket Upgrade. HTTP polling is the approved temporary transport.
- Public read-only smoke checks do not prove authenticated user messaging, order/payment flows, or database migration recovery.
- A direct public smoke attempt from the local Windows environment returned HTTP 403. The successful HTTPS application checks above were made from the VM; access from every external network was not established.
- Production deployment results are recorded in the VM's private deployment journal and `pull-request.json`; logs may contain resolved environment values and must remain private.
