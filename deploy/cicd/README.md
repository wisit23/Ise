# CI/CD สำหรับ Cloud VM ที่ใช้ K3s อยู่แล้ว

ชุดนี้เพิ่ม release images และ deploy ด้วย immutable digest โดยต่อกับ journal,
storage, migration และ locks ของ `deploy/production-cloud` เดิม ไม่สร้าง VM หรือ
ติดตั้ง K3s ไม่เปลี่ยน database images และไม่ reset ข้อมูล

ใช้ VM เดียวโดยไม่มี staging ถาวร งาน deploy เริ่มด้วย workflow_dispatch เท่านั้น
และรอ GitHub Environment `production` approval ที่ผู้ดูแลตั้งค่าไว้
server example ยังปิด CD ไว้ ไม่มีการ deploy เพียงเพราะ release build สำเร็จ

## ไฟล์และการทำงาน

- `Dockerfile`: Node 24, root lockfile และ runtime paths เดิม เช่น
  `/app/services/auth-service/private-kyc-documents`
- `release.py`: สร้าง/ตรวจ manifest ให้ครบ 7 image จาก commit เดียวกันและ registry
  namespace ของ Ise เท่านั้น รวม fingerprint ที่เข้ากับ deployment journal เดิม
- `deploy_release.py`: รับ manifest ผ่าน stdin, ตรวจ server identity, source ancestry,
  schema, registry pull, public routes และ journal ก่อนเปลี่ยน workload
- `smoke.py`: ตรวจ HTTPS frontend, product feed, Engine.IO polling และ WebSocket upgrade
- `ise-deploy`, `entrypoint.py`: root-owned command สำหรับ runner ที่ได้รับสิทธิ์ deploy
- `ise-smoke.service`, `ise-smoke.timer`, `monitor_entrypoint.py`: ตรวจ public routes
  ต่อเนื่องทุก 5 นาทีและบันทึก failure ผ่าน systemd journal
- `.github/workflows/release.yml`: successful CI push บน main เท่านั้นจึง audit แล้ว
  build/publish GHCR และสร้าง artifact `release` ที่มี `release.json`
- `.github/workflows/deploy.yml`: ผู้ดูแลเลือก successful release run แล้วอนุมัติ
  production deployment ไม่ต้องใช้ staging branch, VM ทดสอบ หรือ staging proof

## เงื่อนไขก่อนเปิดใช้งาน

1. **VM เดียว:** ใช้ K3s เดิม namespace `reloop-production` และ ready journal เดิม
   ทดสอบ/build บน GitHub-hosted runners เก็บ image ใน GHCR VM ดึงเฉพาะ release
   ที่อนุมัติ จึงไม่ต้องเพิ่มแอป ฐานข้อมูล หรือไฟล์สำหรับ staging บนเครื่อง
2. **Routing:** ยืนยัน public frontend origin และ proxy ให้ `/api/*` ส่งถึง gateway
   รวม `/api/chat/socket.io` ทั้ง polling และ WebSocket image frontend ใช้ same-origin
   เสมอ เปลี่ยน env ตอน runtime ไม่เปลี่ยน JavaScript ที่ฝังตอน build
3. **Node/architecture:** workflow สร้าง `linux/amd64` เท่านั้น ต้องตรวจ VM เป็น x86_64
   ก่อนเปิดใช้ helper จะบล็อก platform ที่ไม่ตรง ยังไม่ได้ยืนยัน architecture สด
4. **Network:** runner/VM ต้องออก HTTPS 443 ไป GitHub Actions, artifact storage และ
   GHCR ได้ ไม่ต้องเปิด inbound SSH จาก GitHub หรือเปิด K3s API สู่ภายนอก
5. **Audit:** CI และ release ใช้ `scripts/ci/release-audit.cjs` ตรวจ production dependencies
   และบล็อก high/critical ตัวตรวจใช้ npm audit JSON ไม่ใช้ `--force` หรือข้าม audit errors
   VM CPU ต้องใช้ Sharp 0.34.5 ทั้ง frontend/product; pin ผ่าน root override และ lockfile
   ผู้ใช้อนุมัติข้อยกเว้นใน `scripts/ci/release-audit-policy.json` เมื่อ 2026-11-01
   ข้อยกเว้นรับได้เฉพาะ 3 advisory ที่ระบุบน Sharp 0.34.5 และผลกระทบ
   ทาง dependency ที่มาจาก Sharp เท่านั้น direct advisory อื่นหรือ critical ยังบล็อก
   การยอมรับข้อยกเว้นไม่ใช่การแก้ช่องโหว่ ต้องถอนหลังมี patched runtime ที่รองรับ CPU
6. **Deployment boundary:** ไม่มี Actions runner บน production งาน build และอนุมัติ
   อยู่บน GitHub-hosted runners ทั้งหมด VM ใช้ root-owned `pull_requests.py` ดึงเฉพาะ
   public GitHub Release ที่ชื่อ `production-request-<run-id>-<attempt>` ตรวจ successful
   main deploy workflow, release workflow, push CI, immutable Actions artifact digest
   และ manifest ก่อนเรียก
   `ise-deploy` ไม่รับ shell command หรือรันโค้ดจาก workflow บน VM

เอกสาร GitHub ระบุว่า self-hosted runner ติดต่อออกไป GitHub เพื่อรับงานผ่าน HTTPS
และเตือนเรื่อง untrusted workflow บน self-hosted runners:
[network requirements](https://docs.github.com/en/actions/reference/runners/self-hosted-runners),
[secure use](https://docs.github.com/en/actions/reference/security/secure-use)

## เตรียม GitHub (ผู้ดูแลทำเมื่อเงื่อนไขพร้อม)

- ตั้ง branch/ruleset ให้ main ต้องผ่าน `CI result` และ review การเปลี่ยน workflow
- สร้าง Environment `production` จำกัด branch เป็น main และตั้ง required
  reviewer ของ production ปิด bypass ถ้าต้องการให้ approval บังคับกับ admin ด้วย
  workflow อ้างชื่อ environment อย่างเดียวไม่ได้สร้าง required-reviewer rule ให้
- ตั้ง registry packages `ghcr.io/wisit23/ise-<component>` ให้ workflow มีสิทธิ์ publish
  และรักษา image digests ของ release ที่ใช้งาน/ย้อนรุ่น ห้ามลบ image ที่ยังต้องใช้
- Release workflow ใช้ `GITHUB_TOKEN` ที่มี `packages: write` เฉพาะ job publish
- deploy job ใช้ GitHub-hosted runner และ publish request หลัง production approval
- VM อ่าน request สาธารณะโดยไม่ต้องเก็บ GitHub token ส่วน GHCR images ต้อง public
  หรือ provision read-only registry pull Secret แยกต่างหาก
- ไม่ใช้ `STAGING_ENABLED` แล้ว งาน release ไม่เริ่ม deploy อัตโนมัติ

request และ manifest อยู่ใน `deployment-input.zip` เป็นข้อมูลสาธารณะ มีเฉพาะ commit/digests/mode/provenance
ห้ามแนบ resolved configuration, credentials หรือ deployment logs ลง release assets
VM ตรวจ archive กับ SHA-256 ของ immutable Actions artifact ใน run/attempt ที่อนุมัติ
ก่อนอ่านไฟล์ภายใน การแก้ release asset ภายหลังจึงไม่เปลี่ยนคำขอที่อนุมัติแล้ว

## ติดตั้ง command บน VM (ยังไม่ได้ดำเนินการ)

ใช้ checkout ที่ตรวจแล้วและมีไฟล์ใหม่ครบ ไม่ใช้ code จาก runner workspace เป็น root
คำสั่งนี้เป็นตัวอย่างสำหรับผู้ดูแลหลังอนุมัติ deployment-host setup:

```bash
sudo install -d -m 755 /opt/ise-cicd/cicd /opt/ise-cicd/production-cloud
sudo install -o root -g root -m 644 deploy/cicd/{entrypoint,deploy_release,release,smoke,monitor_entrypoint}.py /opt/ise-cicd/cicd/
sudo install -o root -g root -m 644 deploy/cicd/{pull_requests,pull_entrypoint}.py /opt/ise-cicd/cicd/
sudo install -o root -g root -m 644 deploy/production-cloud/k8s-production.py /opt/ise-cicd/production-cloud/
sudo install -o root -g root -m 755 deploy/cicd/ise-deploy /usr/local/sbin/ise-deploy
sudo install -o root -g root -m 644 deploy/cicd/server.example.json /etc/ise-cicd.json
```

แก้ `/etc/ise-cicd.json` ให้ตรง VM โดยผู้ดูแล:

- `root`: checkout เดิมที่ journal ระบุ ไม่ใช่ runner workspace
- `state`: state เดิม `/var/lib/reloop-deploy-k8s`
- `environment`: `production` ให้ตรง labels และ GitHub Environment
- `image_store`: directory จริงที่ containerd ของ K3s เก็บ images ค่าเริ่มต้น
  `/var/lib/rancher/k3s/agent/containerd`; ต้องแก้หาก server ใช้ data-dir อื่น
- `image_pull_budget_gib`: งบพื้นที่สำหรับดึงและ unpack release ใหม่ เป็นจำนวนเต็ม
  GiB มากกว่า 0 ค่าเริ่มต้น 4 GiB เป็น budget ที่ต้องตรวจจากขนาด image จริง ไม่ใช่
  ผลวัดหรือคำรับรองว่าทุกรุ่นใช้พื้นที่เท่านี้
- `public_url`: origin HTTPS จริง ไม่มี path, query หรือ credentials
- `pull_secret`: ชื่อ Kubernetes registry Secret ที่มีสิทธิ์อ่านอย่างเดียว; ใช้ `null`
  หาก packages เป็น public และไม่ต้องใช้ credentials
- `same_origin_verified`: true หลัง public smoke ผ่านกับ routing จริงเท่านั้น
- `enabled`: true เมื่อ setup พร้อม
- `migration_backup_verified`: false จนกว่าจะทดลอง off-VM restore, external-writer
  maintenance และติดตั้ง backup exporter ที่ตรวจแล้ว

config ไม่มี secrets และอ่านได้โดย monitor user; checkout/state และ parent directories
ต้อง root-owned และไม่เขียนได้โดย runner หรือ group/other อย่าเปลี่ยน ownership ของ
checkout เดิมโดยไม่ตรวจงานและผู้ใช้อื่นก่อน `.env` และ private deployment state คงสิทธิ์
อ่านเฉพาะผู้ดูแลตามเดิม ต้องติดตั้ง script จาก revision ใหม่เมื่อเปลี่ยน deploy protocol

ถ้า GHCR เป็น private ให้สร้าง registry pull Secret ใน namespace ของ VM นั้นผ่าน
ช่องทางจัดการ secrets ของผู้ดูแล ห้ามใส่ credential ใน command history หรือ log
ไม่ต้องสร้าง runner user หรือ sudoers rule เพิ่ม timer เรียก protected installed command
โดยตรง config และ command ต้อง root-owned และเขียนได้เฉพาะ root

## ใช้งานและตรวจผล

1. merge main ที่ CI ผ่าน release workflow จะ audit และสร้าง image ทั้ง 7 ส่วน
2. เมื่อ release workflow สำเร็จ เปิด artifact `release` ตรวจ commit/digests และ run URL
3. รัน **Deploy release** จาก main ระบุ `release_run_id`, mode `promote`, migrate=false
4. ตรวจ release ที่เลือกแล้วอนุมัติ GitHub Environment `production` workflow เผยแพร่
   request เป็น public release จากนั้น VM ตรวจทุกสองนาที งานจะไม่ rebuild
   และไม่เปลี่ยน live checkout ไป main ล่าสุดระหว่าง deploy
5. helper ตรวจ disk ก่อน pull และตรวจซ้ำหลังแต่ละ image ก่อนหยุด/แทนที่แอปเดิม
6. GitHub job summary แสดงผล **เผยแพร่คำขอ** ซึ่งไม่ใช่ผล deploy จริง ตรวจผลจริงด้วย
   `systemctl status ise-pull.service`, `journalctl -u ise-pull.service` และ
   `/var/lib/reloop-deploy-k8s/pull-request.json` รวมทั้ง private deployment journal
7. ตัวรับบันทึก request ก่อนเริ่ม deploy หากล้มเหลวหรือถูกตัดการเชื่อมต่อจะไม่ลองซ้ำเอง
   ให้ตรวจ recovery journal แล้วสร้าง request ใหม่ที่ผ่าน approval อีกครั้ง

หลัง config/routing/registry พร้อม ติดตั้งและเปิดตัวรับ:

```bash
sudo install -o root -g root -m 644 deploy/cicd/ise-pull.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ise-pull.timer
sudo systemctl start ise-pull.service
sudo journalctl -u ise-pull.service --no-pager -n 30
```

timer ใช้ public GitHub API แบบไม่เก็บ token ปกติใช้ประมาณ 30 requests/hour เมื่อไม่มี
งานใหม่ หาก GitHub rate-limit หรือ network ล้มเหลวจะไม่ deploy และรอตรวจรอบถัดไป

Public smoke เป็น read-only ไม่ได้พิสูจน์ flow register/order/chat ของผู้ใช้ครบทั้งหมด
ควรทดสอบ flow เหล่านี้บนเครื่อง local/ระบบชั่วคราวที่แยกข้อมูลก่อนปล่อยจริง
การไม่มี staging ทำให้ไม่ได้ตรวจ integration ใน environment เหมือน production ก่อนปล่อย
ต้องรับข้อจำกัดนี้ตอนอนุมัติ ยังไม่ได้ทำ functional rehearsal หรือ production deploy ในงานนี้

### พื้นที่ดิสก์และการเก็บรุ่น

ก่อน pull ต้องเหลือพื้นที่บน image filesystem อย่างน้อย 10 GiB + pull budget
ค่าเริ่มต้นจึงเป็น 14 GiB โดยคง reserve เดิม 10 GiB ไว้ ไม่ลดเกณฑ์เพื่อฝืนให้ deploy ผ่าน
หลัง pull แต่ละ image ต้องยังเหลือ reserve ไม่เช่นนั้นหยุดดึงรุ่นที่เหลือและคงแอปเดิมรันอยู่

หาก state/data อยู่ disk เดียวกับ images และมี migration จะรวมพื้นที่สำหรับ cold snapshot
ด้วย โดยใช้ reserve ที่มากกว่าระหว่าง 10 GiB กับขนาดข้อมูล + 2 GiB แล้วบวก pull budget
หากเป็นคนละ filesystem จะตรวจทั้งคู่แยกกัน ไม่ใช้ free space ของ disk หนึ่งแทนอีก disk

budget ไม่ใช่การจองพื้นที่ของ filesystem ระหว่าง pull ขนาดจริงและงานอื่นยังใช้ disk ได้
จึงยังต้องมี disk monitoring การตรวจนี้ไม่รับรองว่า VM ปัจจุบันมีพื้นที่เพียงพอ
หากไม่ผ่านจะหยุดก่อน downtime และแจ้ง free/required GiB ไม่มี automatic prune

เก็บ release manifest และ GHCR digests ของรุ่นปัจจุบันกับรุ่นก่อนหน้าเพื่อ rollback
ไม่ลบ image/data/backups อัตโนมัติ K3s อาจทำ image garbage collection ของตัวเอง;
จึงต้องรักษา rollback images ใน GHCR ให้ดึงกลับมาได้ การ cleanup รุ่นเก่าบน VM ต้องตรวจ
inventory และสิ่งที่กำลังใช้งานก่อน ไม่ใช้ global image/volume prune

### Migration และการกู้คืน

เลือก migrate=true เฉพาะ reviewed maintenance script เดิมจะหยุด writers และทำ cold
backup ของข้อมูล/ไฟล์ ก่อน migration ต้องมี root-owned protected executable
`/usr/local/sbin/ise-backup-export` ที่รับ private run directory เป็น argument แล้วส่ง
backup ออกนอก VM ตรวจ checksum/receipt และคืน exit 0 เฉพาะเมื่อสำเร็จ ไม่มี exporter
หรือ exporter ล้มเหลวจะไม่รัน migration ต่อและคงแอปหยุดไว้เพื่อ recovery

mode `rollback` ใช้ได้กับ previous successful release ที่บันทึกไว้เท่านั้น schema และ
resolved config ต้องเหมือนกัน และห้าม migrate ไม่ย้อน database โดยอัตโนมัติ
หาก deploy/migration ค้าง journal `incomplete` จะบล็อก run ใหม่ รวมถึง rollback
ต้องอ่าน recovery guide เดิมและคืนสถานะหลังตรวจข้อมูลจริง ไม่แก้ journal เพื่อข้าม guard

การย้อนกลับไป legacy deployment ที่ไม่มี release manifest ไม่รองรับ การเรียก manual
deploy เดิมสำเร็จจะล้าง release marker เพื่อไม่ให้ CD เข้าใจว่ารุ่นเก่ายังทำงานอยู่

### ตรวจต่อเนื่อง

หลัง same-origin smoke ผ่านและ config enabled แล้ว ผู้ดูแลสามารถติดตั้ง timer:

```bash
sudo install -m 644 deploy/cicd/ise-smoke.service deploy/cicd/ise-smoke.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ise-smoke.timer
sudo systemctl start ise-smoke.service
sudo journalctl -u ise-smoke.service --no-pager -n 30
```

monitor นี้ตรวจจาก VM ผ่าน public origin จึงไม่แทน external uptime monitoring
การส่ง alert ไปผู้รับ/ช่องทางทีมยังไม่ได้ตั้งค่า ต้องระบุช่องทางและสิทธิ์ก่อนเชื่อมต่อ
Actions failure ใช้ GitHub notifications ตาม subscription เดิม ไม่มีการส่งข้อความออกไปทีมในงานนี้

## ตรวจโค้ดก่อนนำไปใช้

```bash
python3 -B -m unittest discover -s deploy/cicd -p 'test_*.py' -v
actionlint -shellcheck= .github/workflows/ci.yml .github/workflows/release.yml .github/workflows/deploy.yml
docker build -f deploy/cicd/Dockerfile --target backend --build-arg WORKSPACE=backend/services/auth-service --build-arg RUNTIME_PATH=services/auth-service -t ise-check:auth .
docker build -f deploy/cicd/Dockerfile --target frontend --build-arg WORKSPACE=frontend -t ise-check:frontend .
```

ชุด tests cloud เดิมมี secret-policy tests ที่ไม่ตรง source ซึ่งปิด checks ไว้โดย prior
request ยืนยันผลล้มเหลวเดียวกันที่ baseline `2b356e7` จึงไม่ได้เปิด policy กลับหรือแก้ tests
ใน scope CI/CD นี้ รายการผลตรวจล่าสุดอยู่ใน `docs/cicd-k3s-plan.md`
