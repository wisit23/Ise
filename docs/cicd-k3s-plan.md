# แผน CI/CD สำหรับ Ise บน Cloud VM / K3s

## งานต่อวันที่ 2026-11-01

- ผู้ใช้อนุมัติให้ทำ CI/CD จนเสร็จ เชื่อม Web SSH ใหม่เมื่อ session หลุด และล้าง cache เมื่อพื้นที่ VM ไม่พอ
- ผู้ใช้เลือก **VM ดึง release ที่ผ่าน GitHub production approval** แทน Actions runner บน production
- แนวทาง runner ในบันทึกเก่าด้านล่างถูกแทนด้วย root-owned pull service และ public approved request; ไม่ติดตั้ง runner หรือ GitHub token บน VM
- ตรวจสด: x86_64, พื้นที่ว่าง 17 GB, ทั้ง 10 pods Ready, server HEAD `4212397`, ไม่มี runner/CD command เดิม
- แก้ CI และ push `4c877c0`: lint ผ่าน, backend suites และ Docker builds ทุกส่วนผ่าน CI จริง; frontend ยังล้มเพราะ auction test fixture หมดอายุ 30 ตุลาคม
- ตรึงเวลาใน auction test suite แทนแก้ business logic; local suite ผ่าน 9 tests
- ตั้ง GitHub Environment `production`: required reviewer `wisit23`, จำกัด branch main
- local checks: audience/campaign 14 tests, frontend checkout/campaign 46 tests, deployment helpers 35 tests ผ่าน; lint ผ่านก่อนเพิ่ม pull service
- พบ public WebSocket ส่งกลับ HTTP 400 จาก nginx ภายนอก `192.168.100.225`; gateway บน VM ส่งกลับ HTTP 101 สำเร็จ หน้า init.d ไม่มีตัวเลือกแก้ proxy
- ส่ง pull workflow/service `110a096` และเพิ่มการตรวจ immutable Actions artifact ใน `6d9d065`; actionlint ผ่าน และ helper tests ผ่าน 37 ข้อ
- แก้ release audit ใน `28fd2e3`: product-service ใช้ Sharp 0.35.5 แทน nested 0.34.5; tests ภาพ/upload ผ่าน 27 ข้อกับรุ่นใหม่จริง และ production audit รายงาน 0 vulnerabilities
- [CI ของ 28fd2e3](https://github.com/wisit23/Ise/actions/runs/41231251714) ผ่านครบ; [Release images](https://github.com/wisit23/Ise/actions/runs/41231439304) กำลังรัน ณ บันทึกนี้
- ตรวจ transport กับ GitHub artifact จริง ID `13053796460`: ZIP 122426 bytes มี SHA-256 ตรงกับ GitHub metadata ยืนยันว่าตัวรับสามารถเทียบ archive กับ immutable artifact digest ได้
- ยืนยันติดตั้ง base root-owned wrapper ที่ `/usr/local/sbin/ise-deploy` และ `/opt/ise-cicd`, config `/etc/ise-cicd.json` ยัง disabled; ยังยืนยันการติดตั้ง pull timer บน VM ไม่ได้
- SSH session ถูกปิดและหน้า Connect ไม่มี guest credential เดิมแล้ว; รอเชื่อมต่อใหม่ผ่านช่องส่วนตัว ไม่มีการบันทึกรหัสผ่านลง repository
- ขั้นต่อไป: ให้ release สร้าง image สำเร็จ, ตรวจ registry access/visibility, ติดตั้ง pull service/timer บน VM และตรวจคำขอจริง
- ยังไม่ถือว่า production CD ตรวจรับแล้ว; ยังไม่ได้รับข้อสรุปว่าจะคง WebSocket gate หรือยอมรับ polling ที่ทำงานอยู่เดิม และยังต้องตรวจผล deploy จริง
- ผู้ใช้ยืนยันเพิ่มเติมว่า VM CPU ไม่รองรับ Sharp 0.35.5 และต้องคง 0.34.5; ยกเลิกการใช้ release ของ `28fd2e3` แม้ CI/build ผ่าน ไม่มีคำขอ deploy release นี้
- คืน package.json และ lockfile เป็น `~0.34.5` ตาม constraint; ผลทดสอบบน Windows/GitHub ไม่ใช่หลักฐาน CPU compatibility ของ VM
- release audit ของ 0.34.5 มี 3 advisory ที่ทราบอยู่ ต้องตกลงข้อยกเว้นเฉพาะรายการก่อนเปิด release gate โดยไม่ข้าม findings อื่น
- ผู้ใช้กำหนดใหม่ให้แก้ใน branch `staging` ก่อน และนำเข้า main เมื่อผ่าน checks ครบเท่านั้น; ไม่มีการแก้ main เพิ่มหลังคำสั่งนี้
- root override pin Sharp `~0.34.5` ทั้ง frontend/product; npm ci dry-run ผ่าน ตัวตรวจ audit และ policy exception ที่ยัง disabled เตรียมไว้บน staging
- ผู้ใช้อนุมัติข้อยกเว้นเฉพาะ 3 advisory ของ Sharp 0.34.5 แล้ว เปิดเฉพาะ policy นี้บน staging; high/critical อื่นยังบล็อก และห้ามนำเข้า main ก่อน staging checks ผ่านครบ

วันที่: 2026-10-27

## ข้อตกลงและสถานะ

- โหมดปัจจุบัน: implement และตรวจส่วน repository ตามคำอนุมัติหลังส่งแผน; ยังไม่เปิดใช้บน server
- ผู้ใช้ยืนยันว่าระบบจริงใช้ K3s บน Cloud VM และอนุมัติให้จัดทำแผนหลัง pull main
- ดำเนินการ `git pull --ff-only origin main` สำเร็จ จาก `214b95d` เป็น `2b356e7a9752fd3b7236f43b99b113057be3f106`
- ผลลัพธ์ปัจจุบัน: ทดสอบ/build บน GitHub แล้วส่ง image ที่อนุมัติไป production บน VM เดียว พร้อม disk preflight, migration, ตรวจหลัง deploy และ recovery
- การจัดทำแผนเสร็จเมื่อระบุส่วนที่จะเปลี่ยน ลำดับงาน การตั้งค่าภายนอก และหลักฐานที่ต้องใช้ตรวจรับได้ครบ
- ผู้ใช้อนุมัติให้ implement ต่อด้วย “ok ลองทำหน่อย” และ “ทำต่อได้เลย”; การตั้งค่า GitHub, จัดหา VM, publish image และ deploy จริงยังไม่ได้ดำเนินการ
- ผู้ใช้ยืนยันว่าไม่มี staging และมี VM เดียวซึ่งกังวลพื้นที่ จึงอนุมัติให้ตัด staging gate ใช้ manual production approval และเพิ่ม disk preflight แทน ส่วน same-origin routing ยังไม่แน่ใจ

## หลักฐานจาก repository

| ส่วน | สิ่งที่ตรวจพบ | ผลต่อแผน |
| --- | --- | --- |
| `.github/workflows/ci.yml` | lint, secret scan, service tests, frontend tests/build, Docker build 7 ส่วน และ aggregate CI result | ต่อยอด CI เดิม โดยให้ release ขึ้นกับผลตรวจที่ผ่าน |
| `.github/workflows/ci.yml` | dependency audit มี `continue-on-error: true` | CI เขียวไม่ยืนยันว่าไม่มี advisory; ต้องกำหนดเกณฑ์ release พร้อมข้อยกเว้นที่ตรวจสอบได้ |
| `.nvmrc`, `package.json` | ใช้ Node 24 | image สำหรับ CD ต้องใช้ runtime ที่ทดสอบตรงกัน |
| `frontend/Dockerfile.prod`, backend Dockerfiles ที่ CI ใช้อยู่ | ใช้ Node 22 และติดตั้งด้วย `npm install` | ต้องทำ build path ที่ใช้ Node 24 และ root lockfile ให้ตรวจซ้ำได้; ยังไม่ได้พิสูจน์ว่า build เดิมล้มเหลว |
| `deploy/production-cloud/deploy-k8s.sh`, `git-update.sh` | อัปเดต checkout ไป main ก่อนเรียก Python พร้อม lock และ journal guard | CD ต้องใช้ revision ที่ผ่าน CI แน่นอน ห้ามเปลี่ยนไป main รุ่นใหม่ระหว่าง deploy |
| `deploy/production-cloud/k8s-production.py` | namespace `reloop-production`; build บน VM แล้ว import image เข้า containerd | เพิ่มเส้นทางรับ release image จาก registry โดยคงเส้นทาง manual เดิม |
| `manifests()` และ `migration()` ใน Python ข้างต้น | workload และ migration Job ใช้ `imagePullPolicy: Never` | เปลี่ยน policy เฉพาะ image แอปจาก registry ทั้งสองจุด และจัดการ registry authentication |
| `manifests()` | ใช้ `Recreate`, hostPort และ hostPath บน node ที่ระบุ | เริ่มด้วย deployment ที่มี downtime; ยังไม่สัญญา zero downtime หรือ HA |
| `deploy()` | มี migration status, หยุดแอป, backup เมื่อ migrate, Job, rollout status และ product feed smoke | รักษา guard เดิมและขยายตรวจระบบจริง; ไม่เขียนขั้นตอน migration ใหม่ซ้ำโดยไม่จำเป็น |
| `frontend/lib/api.js`, `frontend/lib/chat.js` | อ่าน `NEXT_PUBLIC_API_URL`; chat ใช้ `/api/chat/socket.io` | frontend ต้องใช้ image digest เดียวข้าม environment ได้ โดย routing ต้องรองรับ API และ WebSocket |
| `frontend/next.config.js` | ยังไม่มี rewrites | ยังสรุปไม่ได้ว่า same-origin routing บน server มีแล้ว ต้องตรวจ reverse proxy จริง |
| `deploy/production-local/Dockerfile` | มีตัวอย่าง Node 24 / root lockfile แต่ layout ต่างจาก cloud image | นำหลักการมาใช้ได้ แต่ห้ามสลับ Dockerfile โดยไม่ตรวจ mount paths และ Prisma assets |

ข้อจำกัดของหลักฐาน: ตรวจ source/configuration เท่านั้น ยังไม่ได้เชื่อมต่อ VM, ตรวจ resource สด, รัน CI หรือทดลอง deploy

## แนวทางที่เลือกสำหรับแผน

ใช้ GitHub Actions เดิมสำหรับตรวจและสร้าง image, GHCR สำหรับเก็บ image และ K3s เดิมสำหรับ production ไม่เพิ่ม Argo CD หรือระบบ orchestration อีกชุดในรอบแรก

### Release ที่ตามรอยได้

- PR รันการตรวจเท่านั้น ไม่ใช้ production credentials และไม่ publish/deploy
- หลัง merge main ให้ทดสอบและ build release จาก commit เดียวกัน หากแยก workflow ให้ผูกกับ successful run ของ main ใน repository นี้ ตรวจ event, SHA และ source repository ห้าม checkout main ล่าสุดแทน SHA ของ run
- ใช้ image สำหรับ `auth-service`, `product-service`, `order-service`, `support-service`, `chat-service`, `gateway`, `frontend`
- รูปแบบชื่อที่เสนอ: `ghcr.io/wisit23/ise-<component>`; tag ใช้อ้างอิง commit แต่ deploy ด้วย `@sha256:...`
- เก็บ release manifest ที่มี commit เต็ม, workflow run URL, image digests ครบ 7 ส่วน, platform, build configuration ที่ไม่ลับ และ checksum ของ schema/migration inputs
- publish หลังตรวจผ่านครบเท่านั้น หาก publish ไม่ครบ ห้าม mark release ว่าพร้อม deploy
- promotion และ rollback รับ release manifest ที่ตรวจแล้ว ไม่รับ shell command หรือ registry path อิสระจาก workflow input
- ใช้ architecture ตรงกับ VM; ต้องตรวจ architecture จริงก่อนเลือก build platform
- image แอปต้องใช้ Node 24 และ root `package-lock.json` กับ `npm ci`; รักษา CMD, working directory, Prisma engine และ absolute paths ของ uploads/attachments ตาม consumer จริง
- ไม่เปลี่ยน database image/version หรือ storage layout พร้อมการต่อ CD

### ใช้ frontend image เดียวข้าม environment

แนวทางที่เสนอคือ frontend ใช้ same-origin API โดย build `NEXT_PUBLIC_API_URL` เป็นค่าว่าง และให้ reverse proxy ของแต่ละ environment ส่ง `/api/*` ไป gateway รวมทั้ง WebSocket ที่ `/api/chat/socket.io`

ก่อนใช้ต้องตรวจ proxy จริง และทดสอบ routes, upload limits, timeout, session behavior, WebSocket upgrade และ reconnect ค่า public อื่นที่ฝังตอน build ต้องบันทึกและใช้เหมือนกันระหว่างการ promote image เดียวกัน ส่วน URL สำหรับอีเมลและการเรียกภายในยังใช้ config ของแต่ละ environment

ถ้า proxy จริงไม่รองรับแนวทางนี้ ให้กลับมาตัดสินใจการเปลี่ยน routing ก่อนเปิด CD ส่วน frontend ที่ deploy ต้องเป็น digest จาก release ที่ผ่าน CI และได้รับอนุมัติ

### Production บน VM เดียว

- ไม่สร้าง staging branch/environment/VM และไม่บังคับ staging proof
- CI และ release build อยู่บน GitHub-hosted runners; เก็บ image ใน GHCR และดึงเฉพาะ release ที่อนุมัติลง VM
- production deploy เป็น workflow_dispatch จาก main เท่านั้น ใช้ Environment `production` ที่ผู้ดูแลต้องตั้ง required reviewer
- ก่อน pull ตรวจ disk สำหรับ images และ state/data รวมถึง snapshot เมื่อ migrate และตรวจซ้ำหลังแต่ละ image โดยไม่ลบข้อมูลหรือ image อัตโนมัติ
- ค่า pull budget เริ่มต้น 4 GiB เป็นงบที่ต้องปรับจากขนาดจริง ไม่ใช่ผลวัด รักษา reserve เดิม 10 GiB จึงต้องมีอย่างน้อย 14 GiB ก่อน pull เมื่ออยู่ disk เดียวกันและไม่มี snapshot ที่ต้องเผื่อเพิ่ม
- ใช้ local/temporary test environment ที่แยกข้อมูลเมื่อต้องทดสอบ flow ผู้ใช้ ยอมรับว่าไม่มี production-like staging rehearsal ก่อนปล่อย
- domain/proxy, capacity สด, runner policy และที่เก็บ backup ยังต้องยืนยันก่อนเปิด CD จริง

### ช่องทาง deploy และการตั้งค่า

อัปเดตจากการตรวจ VM: หน้า status แสดง Ubuntu 24.04, 6 CPU, RAM 12 GB, disk 50 GB
terminal ที่ผู้ใช้เปิดให้ตรวจพบ namespace `reloop-production`, host ports 3000/8080
และ container `reloop-tunnel` ของ Cloudflare อยู่จริง VM ใช้ private IP จึงเลือก
dedicated self-hosted deployment runner แทน SSH จาก GitHub-hosted runner ใน implementation
ยังไม่ได้ติดตั้ง runner หรือแก้บริการจริง และยังไม่ได้ยืนยัน architecture/public proxy
เพิ่มเติมเพราะ session กลับหน้า Connect ระหว่างตรวจ

Ise เป็น public repository การเปิดใช้งาน runner ต้องมี trusted-workflow access policy
ที่ผู้ดูแลตรวจแล้ว labels อย่างเดียวไม่ใช่ access control รายละเอียดอยู่ใน
`deploy/cicd/README.md` ห้ามถือว่า workflow พร้อมติดตั้ง runner บน production ทันที

- implementation ใช้ dedicated deployment runner เรียก root-owned command บน VM เดียวกัน ไม่ใช้ SSH จาก GitHub-hosted runner
- VM ใช้ local K3s kubeconfig ไม่ส่ง admin kubeconfig กลับ Actions และไม่เปิด API 6443 สู่สาธารณะเพื่อให้ CD ทำงาน
- runner ต้องแยกจาก PR/build jobs และเชื่อมออก HTTPS ไป GitHub/GHCR ได้ ไม่เพิ่ม inbound SSH หรือ Kubernetes API เพื่อ CD
- wrapper ฝั่ง VM ตรวจ input, ownership, release provenance และใช้สิทธิ์เฉพาะที่จำเป็น; ห้ามให้ input กลายเป็น arbitrary root command
- registry login สำหรับ publish ใช้ token ของ workflow ที่มี `packages: write` เฉพาะ job publish ส่วน VM ใช้สิทธิ์อ่านอย่างเดียวถ้า package เป็น private
- เพิ่ม image pull credentials ฝั่ง cluster สำหรับแอปและ migration Jobs เมื่อจำเป็น ห้ามพิมพ์ credentials ใน log หรือแนบ resolved secrets เป็น artifact
- `.env` production และ deployment state อยู่ฝั่ง VM ต่อไป การอัปโหลด release ไม่เขียนทับ config หรือ journal เดิม
- ใช้ GitHub deployment concurrency ที่ไม่ cancel งาน production ที่เริ่มแล้ว และใช้ lock เดิมฝั่ง VM ป้องกันชนกับ manual deploy
- บันทึก successful release แยกต่อ environment; release เก่าที่อนุมัติค้างอยู่ต้องไม่ทับ release ใหม่โดยอัตโนมัติ การ downgrade ต้องเป็น rollback ที่ระบุชัด

## งานที่จะทำตามลำดับ

ตารางนี้บันทึกลำดับงาน โดยสถานะและหลักฐานจริงอยู่ในหัวข้อสถานะงานและผลตรวจด้านล่าง

| ขั้น / ผลลัพธ์ | ไฟล์หรือระบบที่เกี่ยวข้อง | วิธีตรวจรับที่เสนอ |
| --- | --- | --- |
| 1. ยืนยัน topology และพื้นที่ VM | ข้อมูล VM/proxy/domain, คู่มือ production-cloud | บันทึก architecture, capacity, namespace, ports, storage, runner access และ backup โดยไม่บันทึก secrets |
| 2. ทำ production build ที่ตรง CI | เสนอ `deploy/cicd/Dockerfile` และปรับ matrix ใน `.github/workflows/ci.yml` | สร้างทั้ง 7 image ด้วย Node 24/lockfile, รันจริง, Prisma query และ mounted-file paths ใช้งานได้; product ffprobe ยังทำงาน |
| 3. ทำ release และเก็บ digests | เสนอ `.github/workflows/release.yml`, helper ใน `scripts/ci/` | PR publish ไม่ได้; CI ล้มเหลวไม่ปล่อย release; publish ไม่ครบไม่ deploy; manifest ผูก SHA และ digests ถูกต้อง |
| 4. ให้ K3s รับ release ที่ระบุ | `deploy/production-cloud/deploy-k8s.sh`, `git-update.sh`, `k8s-production.py` และ tests ข้างไฟล์ | โหมด release ใช้ exact revision และ pull digests ได้ทั้ง workload/Job; manual build/import เดิมยังทำงาน; database images และ hostPath เดิมไม่ถูกเปลี่ยน |
| 5. ตรวจ routing และ disk preflight | `deploy/cicd/deploy_release.py`, server config และ proxy จริง | API/WebSocket ผ่าน; disk ไม่พอบล็อกก่อน pull/หยุดแอป และตรวจ state/images คนละ filesystem ได้ |
| 6. ทำ smoke และ manual production promotion | `.github/workflows/deploy.yml`, `deploy/cicd/smoke.py` | successful release เท่านั้น; Environment reviewer อนุมัติก่อน mutation; ใช้ digests ที่ระบุครบ 7 ส่วน |
| 7. จัดการ migration และ recovery | helpers/tests ใน `deploy/production-cloud/`, runbook | ทดสอบบนสำเนาข้อมูล: migration ผ่าน/ล้มเหลว/ขาดการเชื่อมต่อ และกู้คืนข้อมูลรวมไฟล์ได้จริง |
| 8. ตรวจหลังปล่อยและแจ้งเตือน | deploy workflow, smoke helper, คู่มือ | release สถานะถูกต้องทั้งสำเร็จ/ล้มเหลว; แจ้ง environment/SHA/stage/run URL โดยไม่มี secrets; ตรวจจากนอก cluster ได้ |
| 9. ทดลอง release และ rollback ก่อน production | local/temporary test environment และ runbook | เก็บผล release N, upgrade N+1, failure case และกู้กลับ N ตาม schema compatibility; รัน production จริงเมื่อเงื่อนไขพร้อมและได้รับอนุมัติ |

## Migration และ recovery

1. ก่อนเปลี่ยน workload ตรวจ lock, journal, source SHA, release manifest, registry access, disk, config และ migration status หากผิดให้หยุดก่อนกระทบระบบ
2. release ไม่มี schema change ใช้การตรวจประวัติ migration เดิมก่อน rollout ไม่รัน seed และไม่แก้ schema ตอน pod startup
3. release มี schema change ต้องระบุ migration mode และอนุมัติ maintenance; หยุด writers รวม worker/job ภายนอก และทำ backup ที่สอดคล้องกันของ PostgreSQL, MongoDB, Redis ตามบทบาทจริง และ uploaded/private files
4. นำ backup ออกนอก VM ตรวจ checksum และทดลอง restore ในระบบทดสอบ ค่า retention และ recovery time/data-loss objectives ต้องตกลงกับผู้ดูแลก่อนใช้ production
5. PostgreSQL ใช้ migration runner เดิมที่ตรวจประวัติแล้ว ส่วน MongoDB มีขั้นตอน schema/index ของตนเอง ไม่ถือว่าเป็น SQL migration; รักษา `backoffLimit: 0`, deadline และ journal ที่บล็อก run ค้าง
6. หาก migration ล้มเหลว หยุด promotion เก็บ logs/journal และคง maintenance ตามสถานะจริง ไม่ retry อัตโนมัติหรือรัน fresh/reset
7. app-only failure ที่ยืนยันว่า schema/config ย้อนกลับได้ ใช้ release manifest และ config revision ก่อนหน้าครบชุด ไม่พึ่ง `kubectl rollout undo` แยก service อย่างเดียว
8. หาก schema เปลี่ยนหรือมีการเขียนข้อมูลที่ย้อนเข้ารุ่นเก่าไม่ได้ ให้เลือก forward fix หรือ reviewed restore ระหว่าง maintenance ห้ามอ้างว่า image rollback กู้ข้อมูลได้
9. backup ที่มีอยู่ยังไม่ถือว่า recovery ผ่าน ต้อง restore และตรวจข้อมูลสำคัญ/ไฟล์/API ได้จริง

## เกณฑ์ตรวจและหลักฐาน

- CI เดิมผ่านกับ revision ที่ใช้ release; บันทึก advisory ที่รับรู้และข้อยกเว้นที่มีผู้รับผิดชอบ/วันทบทวน ไม่เปลี่ยน audit ทั้งหมดให้ผ่านด้วยการละเลย error
- ทดสอบ image ที่จะ publish จริง ไม่ใช้ผล test จาก runtime คนละรุ่นเป็นหลักฐานแทน
- service tests, frontend tests และ deployment helper tests ที่เกี่ยวข้องผ่าน; ตรวจ workflow permissions และ event conditions
- functional tests บน local/temporary environment ควรครอบคลุม register/login, ลงสินค้าและอ่าน feed, สั่งซื้อด้วยข้อมูลทดสอบ, chat ส่ง/รับและ reconnect รวมถึง persisted uploads ผ่าน public route
- production smoke ใช้ read-only endpoints เป็นค่าเริ่มต้น; transaction ที่สร้างข้อมูลใช้เฉพาะ synthetic account ที่แยกไว้และได้รับอนุญาต พร้อมวิธีจัดการข้อมูลทดสอบ
- ตรวจ digest ที่รันจริงเทียบ release manifest, readiness, rollout, public TLS/API และ error หลัง deploy; การมี pod Running อย่างเดียวไม่ผ่าน
- กำหนด threshold/ช่วงสังเกตจาก baseline จริงสำหรับ error และ latency ก่อนเปิด automatic recovery ไม่ตั้งตัวเลขลอย ๆ
- แจ้งเตือน failure ผ่าน Actions summary/notification เดิมได้ก่อน; ช่องทางส่งถึงทีมเพิ่มเติมต้องระบุผู้รับและได้รับอนุญาต การแจ้งเตือนต่อเนื่องต้องทำงานหลัง workflow จบด้วย
- เก็บ deploy record ที่มี SHA/digests, เวลา, environment, ผู้อนุมัติ, ผล smoke และที่อยู่ recovery record ฝั่ง VM โดยไม่แนบ secrets หรือ database dumps เข้า GitHub artifact
- ทดสอบ timeout, pull failure, low disk, smoke failure, migration failure, deploy ซ้อน และ interruption แบบ isolated; tests ที่ใช้ mocks ไม่แทนการทดลองกับข้อมูลสำเนา
- single-node K3s + hostPath + Recreate ยังมี downtime และจุดล้มเหลวที่ VM/ดิสก์; แผนนี้ไม่เปลี่ยนเป็น HA

## สถานะงานและจุดต่อ

- เสร็จแล้วใน repository: Dockerfile สำหรับ image ทั้ง 7 ส่วน, release contract, release/deploy workflows, K3s release mode, public smoke, schema-compatible rollback, monitor units และคู่มือตั้งค่า
- production ใช้ manual workflow_dispatch และ Environment approval ไม่ใช้ staging proof หรือ `STAGING_ENABLED`; server config ยังต้องเปิดใช้งานโดยผู้ดูแล
- helper ไม่อัปเดต live checkout ไป main ล่าสุด ไม่ build บน VM และไม่ bootstrap/reset ข้อมูล; คง database images, hostPath และ locks เดิม
- การตรวจ unit/regression และ build จริงบันทึกในหัวข้อผลตรวจด้านล่าง; ยังไม่ publish หรือ deploy
- ยังไม่ทำ: ตั้งค่า GitHub Environment/GHCR/runner, ติดตั้ง command/monitor บน VM, ยืนยัน proxy และทำ functional rehearsal กับข้อมูลทดสอบ
- สิ่งที่ต้องยืนยันก่อน external setup: VM architecture/capacity, image-store path/pull budget, domains/proxy, runner policy, package visibility, ผู้อนุมัติ production และ backup destination/objectives
- งานเดิมที่มีอยู่ก่อน pull ยังคงไว้: `deploy/README.md`, `deploy/k8s/mongo.yaml`, `docker-compose.prod.yml` และไฟล์ `deploy/kind-local*`, `deploy/test_kind_local.py` ไม่เป็นส่วนหนึ่งของการแก้ในแผนนี้
- ตรวจเอกสาร: ตรวจ diff และ path อ้างอิงใน repository; ไม่ถือว่าการตรวจเอกสารเป็นการพิสูจน์ว่า pipeline ทำงาน

### ผลตรวจ implementation วันที่ 2026-10-27

- `python -B -m unittest discover -s deploy/cicd -p 'test_*.py' -v`: ผ่าน 28 tests รวม 5 กรณี disk budget เพิ่มเติม: พื้นที่ต่ำก่อน pull, ต่ำหลัง pull, migration snapshot, แยก image filesystem และ budget ไม่ถูกต้อง
- `test_k8s_logging.py`: ผ่าน 6 tests
- `test_k8s_production.py`: รัน 46 tests; มี 2 test methods ของ secret policy ที่ล้มเหลว (3 assertion failures จาก subtests และ 1 error) ผลเหมือนกันเมื่อรัน source/test เดิมจาก baseline `2b356e7` ใน temporary directory จึงไม่ได้เปิด secret policy ที่ prior request ปิดไว้หรือแก้ tests นอก scope
- `npm run lint`: ผ่าน
- actionlint 1.7.12 ตรวจทั้ง 3 workflows ผ่าน โดยใช้ `-shellcheck=` บน Windows; ตรวจ Bash syntax แยกผ่าน container เพิ่มแล้ว
- หลังตัด staging gate ทดสอบ JavaScript ของขั้น Verify trusted release run จริงด้วย mocked GitHub API ผ่าน 5 กรณี: successful release โดยไม่มี staging, failed release, workflow อื่น, branch อื่น และ rollback ที่สั่ง migrate
- secret scan ของ tracked files ผ่าน และตรวจไฟล์ CI/CD ใหม่ที่ยัง untracked แยกพบ 0 findings
- `npm audit --omit=dev --json`: พบ moderate 3, high 7, critical 2 ณ เวลาตรวจ release gate จึงยังบล็อก publish จนกว่าจะแก้ dependency advisory ในงานที่อนุมัติแยก ไม่ได้ข้าม gate หรือรัน audit fix
- Docker backend ทั้ง 6 ส่วน build ผ่านด้วย Dockerfile ใหม่และรัน Node 24 ได้; service images โหลด Prisma client ได้ และ product-service ใช้ ffprobe ได้
- frontend production build ผ่านด้วย `WORKSPACE=frontend`; ทดลองเริ่ม frontend และ gateway จาก image ใหม่จริงแล้วได้ HTTP 200 ที่ `/` และ `/health` ตามลำดับ โดยไม่ publish host ports และลบเฉพาะ containers ทดสอบที่สร้างขึ้นเองหลังตรวจ
- รวม build ผ่านครบทั้ง 7 image; ตรวจ Bash build-selection steps จริงของ CI และ release ครบทุก component พบ target/workspace/runtime ตรงกันและอ้าง package ที่มีอยู่จริง
- ระหว่างตรวจพบ mapping frontend อ้าง workspace ที่ไม่มีอยู่ จึงแก้ทั้ง CI และ release แล้วตรวจใหม่ผ่าน; ไม่เปลี่ยนโค้ด frontend เพื่อให้ build ผ่าน
- ไม่มีการรัน GitHub Actions จริง, publish image, ติดตั้ง runner หรือเปลี่ยน workload บน Cloud VM ผล tests ที่ใช้ mocks ไม่แทน staging/production rehearsal

## บันทึกแก้ CI วันที่ 2026-10-28

- [CI run 40541080064 / product-service](https://github.com/wisit23/Ise/actions/runs/40541080064/job/122319309632) ล้มที่ `swipe-choose.integration.test.js:300` เพราะคาดว่า unchoose จะลบแถวออก แต่ migration `20261028000000_seller_soft_delete` และ repository ปัจจุบันตั้ง `deletedAt` เพื่อเก็บประวัติ
- จำลอง assertion failure เดียวกันได้บน PostgreSQL 16 และ Redis ทดสอบใน containers แยกที่สร้างสำหรับงานนี้ ใช้ real migrations และ `REQUIRE_INTEGRATION=1`; ไม่ใช้ฐานข้อมูลบน VM หรือฐานข้อมูลพัฒนาของผู้ใช้
- แก้เฉพาะ integration test ให้ตรวจว่า DELETE/POST unchoose เก็บแถวเดิมพร้อม `deletedAt` และ feed แสดง `chosen: false`; เพิ่มการเลือกซ้ำให้ตรวจ ID/createdAt เดิม, `deletedAt: null` และ feed กลับเป็น `chosen: true`
- ชุดทดสอบ swipe integration พร้อม repository/seller tests ที่เกี่ยวข้องผ่าน 10 ข้อ ไม่มี skip; ไม่เปลี่ยน app logic หรือข้าม test เพื่อให้ CI ผ่าน
- ก่อนทดสอบต้อง regenerate Prisma client ฝั่งเครื่องให้ตรง schema เนื่องจาก generated client เดิมในเครื่องยังไม่มี `deletedAt`; CI เดิม generate client ถูกต้องแล้ว ปัญหานี้จึงไม่ใช่สาเหตุของ CI failure
- ผลนี้ยืนยันการแก้ test ในเครื่อง ส่วน CI บน GitHub ต้องดูผล run ของ commit แก้ไขใหม่

## เอกสารทางการประกอบการออกแบบ

- [GitHub: publish Docker images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images) — publish registry images ผ่าน workflow
- [GitHub: environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) — approval rules และ environment secrets
- [Kubernetes: images](https://kubernetes.io/docs/concepts/containers/images/) — digests, pull policy และ registry authentication
- [Kubernetes: Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/) — completion, retry และ deadline ของ migration Jobs
- [Kubernetes: Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) — rollout และ rollback ของ workload ซึ่งไม่ย้อน database


### Release dependency audit fix (2026-10-28)

- Approved in chat: update vulnerable dependencies, test/build, and push to main; keep the release audit gate enabled.
- Reproduced release failure with `npm audit --omit=dev`: 12 findings (3 moderate, 7 high, 2 critical).
- Next.js stays on major 15, minimum 15.5.28; Sharp minimum 0.35.5; Nodemailer pinned to 10.1.4. Refresh affected transitive packages within their existing compatible ranges.
- Next.js 15.5.28 still pins PostCSS 8.4.31. A root override limited to Next.js selects patched PostCSS 8.x; frontend tests and the production image build must validate this compatibility. Revisit this override when upgrading Next.js.
- Verified: `npm audit --omit=dev --audit-level=high` reports 0 vulnerabilities; lint and tracked-file secret scan pass. All seven images build with the production Dockerfile. Frontend `/` and gateway `/health` return HTTP 200 in temporary containers; the gateway root needs upstream frontend and is not its standalone health endpoint.
- Windows clean `npm ci` hit a transient Prisma engine download ECONNRESET. Retried `npm ci --ignore-scripts` successfully, then generated all five Prisma clients successfully. Linux Docker npm ci/build succeeds with install scripts enabled.
- Component suites: shared, gateway, scripts, auth, order, chat and support pass. Product unit run: 460 pass; category SQL test initially failed because the isolated database endpoint was intentionally unavailable, then passes against a temporary PostgreSQL 16 database with session-local tables. Production Linux Sharp image conversion tests: 7/7 pass. Full service integration suites remain for GitHub CI.
- Frontend tests: 177 suites / 1,277 tests pass. Runtime image checks confirm all seven use Node 24; all six backend images resolve Express 4.22.3; frontend resolves Next.js 15.5.28 and patched PostCSS 8.5.32. Temporary smoke/SQL containers and their private volumes were removed.
- Push this dependency fix to main, then inspect the new CI run. Release images starts only after successful push CI; no deployment to the VM is performed by this fix.
- Upstream references: [Next.js 15.5.28](https://github.com/vercel/next.js/releases/tag/v15.5.28), [Sharp 0.35 migration notes](https://github.com/lovell/sharp/releases/tag/v0.35.0), [Sharp 0.35.5](https://github.com/lovell/sharp/releases/tag/v0.35.5).
