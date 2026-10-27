# RE-LOOP: คืนพื้นที่และกู้ระบบหลัง DiskPressure

วันที่ตรวจเสร็จ: 28 ตุลาคม 2026 เวลา 03:52:40 น. Asia/Bangkok

## ผลสุดท้าย

- พื้นที่ว่าง root filesystem: 17.07 GiB
- Node Ready=True, DiskPressure=False, MemoryPressure=False, PIDPressure=False
- Node ไม่มี taints
- Deployment ทั้ง 10 ตัวมี readyReplicas=1
- Public frontend `/`: HTTP 200
- `/api/products/feed?limit=1`: HTTP 200 และ items เป็น array
- `/api/chat/socket.io/?EIO=4&transport=polling`: HTTP 200 และมี Engine.IO session ID
- กู้แอปชุดเดิม tag `run-20261027t111615z-529952`; ไม่ได้เริ่ม deploy รอบใหม่
- ไม่ได้ทดสอบธุรกรรมผู้ใช้ครบทุก flow หรือ WebSocket upgrade ในรอบนี้

## สาเหตุและสิ่งที่ยืนยันได้

Events ที่ผู้ใช้ส่งมาระบุการ Evicted เนื่องจาก ephemeral-storage ต่ำ และ node มี taint `node.kubernetes.io/disk-pressure:NoSchedule` ทำให้ pods ใหม่ Pending แม้ Ready=True

เมื่อเข้า Web SSH พบ Docker images สะสมหลายรอบ รวม 27 image records และ build cache อีกประมาณ 12 GB ขณะสคริปต์ deploy รอบ `run-20261027T202053Z-975925` ค้างที่ migration-status Job

การตรวจสคริปต์ปัจจุบันพบว่า preflight capacity ส่วนหนึ่งใช้เฉพาะการติดตั้งครั้งแรก ส่วนรอบ update เรียก build/import และ migration-status ก่อนตรวจพื้นที่สำรอง 10 GiB อีกครั้ง จึงไม่ป้องกันการใช้ disk สูงสุดระหว่าง build/import ได้ การรันคำสั่งที่ถูกต้องยังสามารถกระตุ้น DiskPressure จน pods เดิมถูก evict ได้

หลัง kubelet เก็บกวาด images พบ pods ใหม่ ErrImageNeverPull เพราะ deployment ใช้ imagePullPolicy=Never และ image ที่ต้องใช้หายจาก K3s จึงต้องคืนพื้นที่และนำ image กลับเข้าระบบด้วย

## การล้างพื้นที่

ดำเนินการผ่าน SSH Terminal ใน `https://init-d.cskmitl.com/status`

1. ตรวจ disk/inodes, Docker usage, deployment/job image references, journal และกระบวนการ deploy
2. สร้างรายการลบที่ไม่ชนกับ image references ของ deployments/jobs และ journal
3. ลบ Docker image tags ที่ไม่ใช้งาน 9 รายการจากสองรอบ:
   - `run-20261027t192847z-929102`: 7 แอป
   - `run-20261027t201000z-965387`: Auth และ Product
4. ไม่ลบ Docker images ของ build ล่าสุด `run-20261027t202053z-975925`
5. หลังคืน image ให้ K3s และยืนยันว่าแอปพร้อมแล้ว ลบสำเนา Docker ของแอปชุดเดิม `run-20261027t111615z-529952` อีก 7 รายการ โดยเก็บ image ของชุดนี้ใน K3s ไว้ครบ

ใช้ `docker image rm <exact-image-tag>` ไม่มี `--force` และบันทึกผลไว้ ไม่ใช้ system prune หรือ volume prune ไม่ลบ database images, volumes, uploads หรือ backup directories

## การคืน images ให้ K3s

ตรวจ images ที่ deployments/jobs ต้องใช้เทียบกับ image list ของ K3s แล้วตรวจว่ายังมีสำเนาใน Docker นำ image ที่หาย 9 รายการกลับเข้า K3s โดยส่ง stream จาก Docker save เข้า containerd import ไม่สร้าง tar file ก้อนใหญ่เพิ่มบน disk

รูปแบบคำสั่ง:

```bash
docker image save <exact-image> | k3s ctr -n k8s.io images import -
```

คืน PostgreSQL, MongoDB และ Redis ก่อน ตามด้วย application images ที่หายและ Auth image ของ status Job ปัจจุบัน การคืน images ทำงานใน tmux session `recover-images-20261028`

สคริปต์ deploy ที่เคยค้างออกไปแล้วก่อนขั้นกู้ images จึงไม่ได้เริ่ม deploy ซ้ำหรือพยายามฝืน journal ให้ผ่าน

## การกู้ MongoDB และ Chat

หลังคืน image MongoDB รันได้แต่ไม่ ready และ Chat ยังไม่ ready:

- Readiness probe ใช้ `mongo ... ismaster` แล้ว fallback ไป `mongosh`
- ข้อความ `mongosh: not found` เป็นข้อความจาก fallback ไม่ใช่สาเหตุหลักที่พิสูจน์ได้
- MongoDB มี replica-set config เดิมสมาชิก `mongo:27017` แต่รายงาน `Our replica set config is invalid or we are not a member of it`
- Mongo Service มี endpoint ready=False และ publishNotReadyAddresses=False

เพื่อให้สมาชิก Mongo ติดต่อชื่อ Service ของตัวเองระหว่างเริ่มต้นได้:

1. สำรอง Mongo Service JSON เดิม
2. Patch เฉพาะ Mongo Service ภายในเป็น `spec.publishNotReadyAddresses=true`
3. Restart เฉพาะ deployment/mongo ด้วย Recreate strategy เดิม หลัง Mongo ไม่กลับเป็น primary เอง
4. ตรวจพบ MongoDB และ Chat กลับมา ready=1 ทั้งคู่

คำสั่งแก้ Service เทียบเท่า:

```bash
k3s kubectl -n reloop-production patch service mongo --type=merge \
  -p '{"spec":{"publishNotReadyAddresses":true}}'
k3s kubectl -n reloop-production rollout restart deployment/mongo
```

ไม่ได้รัน rs.initiate/rs.reconfig ไม่ได้เปลี่ยนสมาชิก replica set และไม่ได้ล้างหรือ reset ข้อมูล MongoDB

การแก้นี้อยู่ที่ Kubernetes Service ที่รันจริง ยังไม่ได้แก้ตัวสร้าง manifests ใน repository

## หลักฐานบน server

```text
/var/lib/reloop-deploy-k8s/cleanup-20261028-plan.json
/var/lib/reloop-deploy-k8s/cleanup-20261028-images.log
/var/lib/reloop-deploy-k8s/cleanup-20261028-docker-duplicates.json
/var/lib/reloop-deploy-k8s/cleanup-20261028-restore.json
/var/lib/reloop-deploy-k8s/cleanup-20261028-restore.py
/var/lib/reloop-deploy-k8s/cleanup-20261028-restore.log
/var/lib/reloop-deploy-k8s/cleanup-20261028-mongo-service-before.json
```

## สิ่งที่ยังต้องแก้ก่อน deploy รอบถัดไป

งานนี้คืนพื้นที่และกู้ระบบเดิม ไม่ได้แก้ source ของ deployment script

- ต้องเพิ่ม capacity guard สำหรับ update ก่อน build/import และตรวจพื้นที่ระหว่างขั้นที่ใช้ disk เพิ่ม
- ต้องจัดการการเก็บ images/cache ให้มีพื้นที่สำหรับ peak usage และไม่พึ่งการคืนพื้นที่หลัง build เสร็จ
- ต้องนำการตั้งค่า Mongo Service ที่จำเป็นตอนเริ่มต้นเข้าไปใน manifests generator เพื่อให้สร้าง Service ใหม่ได้ถูกต้อง
- พื้นที่ 17.07 GiB เป็นค่าหลัง recovery ไม่ใช่การรับประกันว่า build รอบถัดไปจะมีพื้นที่พอ
- เว็บไซต์กลับมาตอบแล้ว แต่ไม่ได้อ้างว่าตรวจทุกแถวข้อมูล/ทุก user flow หรือพิสูจน์ว่า deploy รอบใหม่สำเร็จ

สกิลที่ใช้: mybro | ref ที่ใช้: Senior Mentor | playbook ที่ใช้: Runtime Forensics
