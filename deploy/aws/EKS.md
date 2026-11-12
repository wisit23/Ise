# EKS staging: Node 22, ECR, Amplify และ CloudFront

เส้นทางปัจจุบันคือ `fullcloudstaging` -> **EKS โดยตรงแบบ Auto Mode** ใน Sydney
(`ap-southeast-2`) ไม่ใช่ Beanstalk Cluster และยังไม่เชื่อมกับ production
บัญชีโปรเจกต์ที่ยืนยันจาก IAM/ECR คือ `997229934811`

ยังไม่ได้สร้าง cluster หรือทรัพยากร AWS จากไฟล์ใน repo นี้
cluster จะเริ่มมีค่าใช้จ่ายเมื่อสร้าง แม้ยังไม่มีผู้ใช้เว็บ

## สิ่งที่ใช้ต่อได้

- Amplify frontend เดิม
- S3 media bucket และการตรวจสิทธิ์ไฟล์ใน API เดิม
- ECR repositories 6 ตัวและ images จาก build ที่ผ่านแล้ว
- GitHub Secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- Repository Variables `AWS_ACCOUNT_ID`, `AWS_REGION`

`application.zip` เป็น bundle สำหรับ Beanstalk ไม่ต้องอัปโหลดเข้า EKS
workflow ใหม่อ่านเฉพาะ `release.json` ใน artifact `aws-release` แล้วสร้าง
`platform.json` และ `workloads.json` สำหรับ Kubernetes

ไม่ใช้ `deploy/k8s` เดิมโดยตรง เพราะชุดนั้นมีฐานข้อมูล, local images และ
คำสั่งเปลี่ยน schema ตอนเริ่ม container ซึ่งไม่เหมาะกับ staging cloud ชุดนี้

## ภาพรวมระบบเมื่อยังไม่มีโดเมนส่วนตัว

```text
Browser -> Amplify frontend
        -> HTTPS https://<distribution>.cloudfront.net
           -> CloudFront VPC origin -> internal ALB:80
              -> gateway -> auth / product / order / chat / support
                          -> PostgreSQL / MongoDB replica set / Redis ภายนอก
                          -> private S3 ผ่าน EKS Pod Identity
```

CloudFront มี certificate สำหรับชื่อ `cloudfront.net` ของ distribution ให้
จึงไม่ต้องซื้อโดเมนหรือขอ ACM certificate สำหรับ API ในรูปแบบนี้
ช่วง browser -> CloudFront เป็น HTTPS ส่วน origin ใช้ HTTP ภายใน VPC
ไม่ใช่ TLS ตลอดทุกช่วงทาง ห้ามเปลี่ยน internal ALB เป็น public เพื่อแก้การเชื่อมต่อ

CloudFront VPC origins รองรับ WebSocket แล้วตั้งแต่ 1 พฤษภาคม 2026 และมีบริการใน
Sydney ต้องตรวจ HTTP polling, cookies และ reconnect จริงร่วมกับ Amplify อีกครั้ง

## 1. เตรียมข้อมูลและงบก่อนเปิด cluster

1. ตรวจ credits/spend limit และราคาของ EKS, Auto Mode, EC2, ALB, NAT, IPv4,
   CloudFront, CloudWatch และบริการข้อมูลที่เลือก การเข้าใช้บริการได้ใน Free plan
   ไม่ได้หมายความว่าบริการนั้นไม่มีค่าใช้จ่าย
2. EKS standard-support control plane มีราคาฐาน $0.10/ชั่วโมง ประมาณ $73 ต่อ
   730 ชั่วโมง ยังไม่รวมรายการอื่น ไม่ควรเปิดทิ้งไว้เพื่อรอทำ DNS/ฐานข้อมูล
3. เตรียม PostgreSQL สำหรับ auth/product/order/support, MongoDB replica set
   สำหรับ chat และ Redis ที่ทุก pod ติดต่อได้ ใช้ TLS ตามผู้ให้บริการ
   `192.168.x.x` ของ VM มอไม่สามารถเข้าถึงจาก AWS โดยอัตโนมัติ
4. ใช้ข้อมูล staging แยกจาก production สำรองข้อมูลและทดลอง restore ก่อนย้าย
   ต้องเตรียม schema ผ่าน migration ที่ตรวจแล้ว ไม่มี migration/seed ใน pod startup
5. เตรียม SMTP sender/host และ credentials สำหรับ auth ที่ส่งอีเมลได้จริง

## 2. ตั้ง GitHub configuration

Repository Variables:

| Name             | Value            |
| ---------------- | ---------------- |
| `AWS_ACCOUNT_ID` | `997229934811`   |
| `AWS_REGION`     | `ap-southeast-2` |

สร้าง GitHub Environment `aws-staging` จำกัด deployment branch เป็น
`fullcloudstaging` แล้วใส่ **Environment Variables** ต่อไปนี้:

| Name                  | Value                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| `AWS_FRONTEND_ORIGIN` | HTTPS origin ของ Amplify staging ไม่มี `/` ท้าย                           |
| `AWS_MEDIA_BUCKET`    | ชื่อ S3 media bucket ไม่ใช่ bucket สำหรับ bundles                         |
| `AWS_MAIL_FROM`       | ผู้ส่งอีเมลที่ใช้ได้กับ SMTP                                              |
| `AWS_SMTP_HOST`       | SMTP hostname                                                             |
| `AWS_EKS_API_ORIGIN`  | เว้นว่างตอน bootstrap; ใส่ `https://…cloudfront.net` หลังสร้าง CloudFront |

เก็บ Access Key สองตัวใน Repository Secrets ตามเดิม ไม่ใส่ใน pods หรือไฟล์ JSON
workflow `AWS EKS staging` จำกัดชื่อ cluster/namespace เป็น `reloop-staging`

## 3. Render โดยยังไม่สร้าง AWS resources

1. เปิด Actions -> **AWS EKS staging** -> Run workflow
2. เลือก `fullcloudstaging`
3. ใส่ `source_run_id` ของ build ที่ผ่าน เช่น `43126302503`
4. ไม่ติ๊ก `deploy` และ `compatible`
5. ดาวน์โหลด artifact `aws-eks-staging` เมื่อผ่าน

workflow ตรวจว่า source เป็น build ของ repo/branch ที่กำหนด, สำเร็จ,
เป็น manual run และ digests/commit/version/registry ตรงกันก่อน render
ใช้ build เก่าที่ผ่านได้โดยไม่ต้อง rebuild เพื่อเปลี่ยนวิธี deploy

หากยังไม่เห็น workflow ต้องนำไฟล์ workflow ไปลง default branch `main` ก่อน
แต่เวลา Run ให้เลือก `fullcloudstaging` ซึ่งมีสคริปต์ EKS อยู่ครบ

## 4. สร้าง EKS Auto Mode และ network ด้วยบัญชีผู้ดูแล

ทำใน console ของโปรเจกต์ Sydney หลังตรวจค่าใช้จ่ายแล้ว:

1. สร้าง/เลือก VPC ที่มี private subnets อย่างน้อยสอง AZ ให้ pods/nodes
   มี IPv4 ว่างเพียงพอ เลือก private subnets สอง AZ สำหรับ EKS และ internal ALB
2. จัด outbound จาก private nodes ไป ECR/S3/EKS Auth/STS และ data providers
   ใช้ NAT หรือ endpoints ที่ครบตาม traffic จริง Single NAT ลดค่าใช้จ่ายแต่เป็น
   single point of failure ของ outbound; Multi-AZ pods ไม่ได้แก้จุดนี้
3. CloudFront VPC origin ต้องมี Internet Gateway ผูกกับ VPC ตามข้อกำหนด AWS
   แต่ ALB/nodes ยังคงอยู่ private subnets ไม่ต้องเปิด public IP ให้ node
4. EKS -> Create cluster -> ตั้งชื่อ **`reloop-staging`** เปิด Auto Mode
   เลือก Kubernetes version ที่ยังอยู่ใน standard support และ standard upgrade policy
5. ใช้ cluster IAM role และ node IAM role ตามปุ่ม/คำแนะนำ EKS Auto Mode ของ AWS
   ไม่ใช้ IAM user `reloop-github-deploy` เป็น cluster role หรือ node role
6. เปิด authentication แบบ EKS API/access entries ให้ผู้สร้างมีสิทธิ์ bootstrap
   cluster นี้ GitHub-hosted runner ต้องเข้าถึง Kubernetes API endpoint ได้
   public+private endpoint ใช้ IAM/RBAC ป้องกัน API หากจำกัด CIDRs ให้ใช้ runner
   ที่มี egress คงที่/อยู่ใน VPC แทน ไม่แก้ network โดยอัตโนมัติใน workflow
7. เปิด built-in `system` NodePool ไว้เพื่อให้มี `default` NodeClass
   ไม่จำเป็นต้องเปิด `general-purpose` สำหรับแอปชุดนี้ เพราะไฟล์ platform
   มี NodePool `reloop-staging` แยกไว้แล้ว
8. รอ ACTIVE แล้วติดตั้ง **Metrics Server** ผ่าน Add-ons -> Community add-ons
   ตามเวอร์ชันที่ EKS แนะนำให้ cluster นี้

custom NodePool รองรับ amd64 on-demand M-family รุ่นใหม่ที่มี 2 vCPU และมี
ขอบเขต 8 vCPU/32Gi รวมไว้เผื่อ replacement แต่ขอบเขตนี้ครอบคลุมเฉพาะ pool นี้
ไม่ใช่เพดานค่าใช้จ่ายทั้งบัญชีหรือ built-in system pool

## 5. Bootstrap platform และ Pod Identity

ใช้ CloudShell/เครื่องผู้ดูแลที่ AWS CLI และ kubectl ติดต่อ cluster ได้
ตรวจ `aws sts get-caller-identity` ว่าเป็นบัญชีโปรเจกต์ก่อนทำคำสั่ง
อย่าใช้ kubeconfig ของ VM/K3s เดิม

```bash
aws eks update-kubeconfig --region ap-southeast-2 --name reloop-staging --alias reloop-eks-staging
kubectl config current-context
kubectl apply --server-side --field-manager=reloop-eks-admin -f platform.json
kubectl get nodepools
kubectl get ingressclass reloop-staging
kubectl top nodes
```

`platform.json` ต้องมาจาก artifact ที่ render ในข้อ 3 และมี Namespace,
ServiceAccount, NodePool, IngressClassParams/IngressClass และ RBAC สำหรับ CI
ไม่ได้สร้างฐานข้อมูลหรือเก็บ secrets

สร้าง IAM role สำหรับ EKS Pod Identity โดย trust `pods.eks.amazonaws.com`
ให้ `sts:AssumeRole` และ `sts:TagSession` ตามเอกสาร AWS และจำกัด role ให้ใช้กับ
namespace/service account ที่ต้องการ โดย role นี้ให้เฉพาะ S3 media permissions:

- `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` บน media bucket prefix `reloop-staging/*`
- `s3:ListBucket` บน bucket โดยจำกัด `s3:prefix` ให้ตรง prefix ข้างต้น
- KMS permissions เพิ่มเฉพาะเมื่อ bucket ใช้ customer-managed KMS key

ใน EKS -> Access -> Pod Identity associations สร้าง association:

| Field           | Value                          |
| --------------- | ------------------------------ |
| Cluster         | `reloop-staging`               |
| Namespace       | `reloop-staging`               |
| Service account | `reloop-backend`               |
| Role            | IAM S3-media role ที่เตรียมไว้ |

Auto Mode มี Pod Identity agent ให้แล้ว ไม่ต้องสร้าง IAM OIDC provider
node role ใช้ดึง ECR images ส่วน pod role ใช้เข้าถึง media ไม่ใช่หน้าที่เดียวกัน

## 6. Runtime secrets และสิทธิ์ GitHub deploy

สร้าง Secrets Manager secret ชื่อ `reloop/staging/runtime` เป็น JSON object
โดยใช้ค่า **staging จริง** สำหรับ keys ต่อไปนี้:

```text
DATABASE_URL_AUTH
DATABASE_URL_PRODUCT
DATABASE_URL_ORDER
DATABASE_URL_SUPPORT
DATABASE_URL_CHAT
REDIS_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
INTERNAL_SERVICE_TOKEN
SMTP_USER    (ใส่เมื่อใช้ SMTP authentication)
SMTP_PASS    (ใส่เมื่อใช้ SMTP authentication)
```

ทุก value ต้องเป็น string ที่ไม่ว่าง ไม่ใส่ AWS Access Keys ใน secret นี้
clone repo branch `fullcloudstaging` บนเครื่องผู้ดูแลที่มี Python แล้วใช้ pipeline
ด้านล่าง **ทั้งบรรทัด** เพื่อไม่แสดง SecretString บน terminal:

```bash
aws secretsmanager get-secret-value --region ap-southeast-2 --secret-id reloop/staging/runtime --query SecretString --output text | python3 deploy/aws/eks_secret.py | kubectl apply --server-side --field-manager=reloop-secrets -f -
```

ข้อมูลผ่าน stdin เข้า Kubernetes Secret `reloop-runtime` ไม่เขียนไฟล์ลง repo
การนำเข้าครั้งนี้ไม่ใช่ automatic secret rotation หากเปลี่ยนค่า ต้อง import ใหม่
แล้ว rollout pods ภายใต้การทบทวนผลกระทบ Kubernetes Secrets ต้องได้รับการป้องกัน
ด้วย EKS encryption/RBAC ตามปกติ base64 ไม่ใช่การเข้ารหัสความลับ

เพิ่ม inline IAM policy ให้ `reloop-github-deploy` จากสิทธิ์ ECR เดิม:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "eks:DescribeCluster",
      "Resource": "arn:aws:eks:ap-southeast-2:997229934811:cluster/reloop-staging"
    }
  ]
}
```

ผู้ดูแลสร้าง EKS Access entry ของ IAM user นี้ แล้วผูก Kubernetes group
`reloop-staging-deployers` ไม่ต้องให้ ClusterAdmin policy กับ GitHub:

```bash
aws eks create-access-entry --region ap-southeast-2 --cluster-name reloop-staging --principal-arn arn:aws:iam::997229934811:user/reloop-github-deploy --type STANDARD --kubernetes-groups reloop-staging-deployers
```

Role ที่ bootstrap อนุญาตแก้แอปเฉพาะ namespace นี้ ไม่ให้ Secrets read API,
cluster-admin หรือสร้าง platform resources อย่างไรก็ตามสิทธิ์เปลี่ยน deployment
ยังเป็นสิทธิ์รันโค้ดที่ใช้ app secrets ได้ จึงต้องป้องกัน workflow/branch และ keys

## 7. Deploy backend ภายใน cluster

1. Run **AWS EKS staging** จาก `fullcloudstaging` โดยใช้ build run ID เดิม
2. ตรวจ schema/parallel workers/backups ก่อนติ๊ก `compatible`
3. ติ๊ก `deploy` เมื่อ platform, secret, identity และ data services พร้อมแล้ว

workflow ตรวจ account/cluster ARN/Auto Mode, ติดตั้ง kubectl รุ่น minor ตรงกับ
cluster พร้อม checksum, server-dry-run แล้ว apply เฉพาะ `workloads.json`
ไม่มีสร้าง cluster, platform, secret, migration หรือ seed อัตโนมัติ

ทุก service มี `/ready`, `/health`, HPA 2-3 replicas และ PDB ขั้นต่ำ 1 pod
พร้อม rolling update `maxUnavailable=0`, `maxSurge=1` และกระจายสอง AZ
ต้องมี Metrics Server และ capacity สอง AZ จริง ถ้าขาด capacity pods จะ Pending
การ apply ไม่ reset replicas ที่ HPA ปรับไปแล้ว

รอบแรกที่ยังไม่มี `AWS_EKS_API_ORIGIN` จะรายงานชัดว่า **ตรวจได้เฉพาะ private
workloads ยังไม่ได้ verify public API** ต้องทำข้อถัดไปก่อนเชื่อม frontend

## 8. สร้าง CloudFront VPC origin และใช้ชื่อ HTTPS ที่ AWS ให้

1. ตรวจ internal ALB ของ Ingress `gateway` ใน EC2 -> Load Balancers
2. CloudFront -> VPC origins -> Create เลือก ARN ของ internal ALB ตัวนี้
   ใช้ HTTP origin port 80 และทำ security group/network prerequisites ตาม AWS
   จำกัด origin ให้รับจาก CloudFront service-managed SG ตามขั้นตอนของ AWS
   โดยคงกฎ backend ที่ Auto Mode ใช้ตรวจสุขภาพ/เข้าถึง pod
3. รอ VPC origin เป็น Deployed แล้วสร้าง CloudFront distribution โดยเลือก
   VPC origin ตัวนี้ ใช้ default domain/certificate `*.cloudfront.net`
4. ตรวจ pricing option ที่บัญชีรองรับ อย่าสับสน AWS account Free plan กับ
   CloudFront flat-rate Free plan เลือกรูปแบบที่รองรับ VPC origins และดูประมาณการ
5. Viewer protocol policy: **Redirect HTTP to HTTPS**
6. Allowed methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
7. Cache policy: **CachingDisabled** เพื่อไม่ cache auth, private media หรือ API data
8. Origin request policy: **AllViewer** เพื่อส่ง Authorization, Origin, cookies,
   query strings และ WebSocket headers ให้ครบ ไม่ต้องตั้ง CloudFront custom domain
9. ตรวจ error caching minimum TTL เป็น 0 สำหรับ API และไม่เปลี่ยน error เป็น 200
10. เมื่อ distribution Deployed ใส่ชื่อ HTTPS ไม่มี `/` ท้ายใน Environment Variable
    `AWS_EKS_API_ORIGIN` แล้วรัน deploy เดิมซ้ำเพื่อตรวจ `/ready`, `/health`
    ที่ release identity ตรง และ `/api/products/feed` ผ่าน public HTTPS

## 9. เชื่อม Amplify และตรวจการใช้งานจริง

ตั้ง Amplify branch `fullcloudstaging`:

```text
NEXT_PUBLIC_API_URL=https://<distribution>.cloudfront.net
NEXT_PUBLIC_SOCKET_CREDENTIALS=true
```

Redeploy frontend เพราะ `NEXT_PUBLIC_*` ฝังค่าตอน build ตรวจ login, email,
upload, การอ่านไฟล์ private, chat polling/WebSocket, reconnect ระหว่าง rollout
และการมองเห็นประวัติ ใช้ devtools ตรวจ cookie affinity เมื่อทำงานข้าม site
CloudFront ต้องส่ง cookies/headers โดยไม่ cache response เพื่อให้ affinity ทำงาน

ALB pin browser -> gateway และ Service `chat-service` ใช้ ClientIP affinity
สำหรับ gateway -> chat pod เมื่อ pod เปลี่ยนต้อง reconnect ได้ ไม่รับประกันว่า
WebSocket เดิมจะไม่หลุดระหว่าง deployment

## Release, rollback และงานที่ยังไม่เสร็จ

- build โค้ดใหม่ด้วย **AWS stage backend (build images)** แล้ว deploy source run ID
  ที่ผ่านเท่านั้น ไม่ใช้ image tag ที่เขียนทับได้
- เก็บ artifacts และ ConfigMaps รุ่นก่อน (ชื่อ hash, immutable) สำหรับ rollback
  หากจำเป็น ให้เลือก source run ID ที่เคยใช้งานได้และ rerun EKS workflow หลัง
  ตรวจ schema, workers และ backup การ rollback แอปไม่ย้อนข้อมูลฐานข้อมูล
- rollout ที่ล้มเหลวอาจทำให้บาง services เป็นรุ่นใหม่ไปแล้ว workflow จะหยุด
  ไม่สั่ง rollback แยก service หรือย้อนฐานข้อมูลโดยเดาเอง
- ชุดนี้เริ่มด้วย **rolling update** ไม่ใช่ implementation ของ Blue/Green
  ไม่อ้าง zero downtime จนทดสอบ traffic, database compatibility, capacity,
  affinity และ reconnect แล้ว ต้องออกแบบเส้นทาง production แยกภายหลัง
- ยังไม่เปิด production หรือย้ายข้อมูลจริงออกจาก VM
- หลัง demo ต้องทบทวน cleanup ของ CloudFront/VPC origin, Ingress/ALB, node pools,
  cluster, NAT และ storage ตามลำดับ dependency การลบแค่ pods ไม่หยุดค่าบริการ EKS

## ตรวจในเครื่องก่อน deploy

```bash
python3 -B -m unittest discover -s deploy/aws -p 'test_*.py' -v
python3 deploy/aws/eks.py --release release.json --config eks-config.json --output out-eks
```

`eks-config.json` มีเฉพาะ `frontend_origin`, `media_bucket`, `mail_from`, `smtp_host`
เป็น string ทั้งหมด ไม่ใส่ secrets และไม่ใช้ origin ที่มี `/` ท้าย

## เอกสารหลักที่ใช้ตรวจ

- [EKS Auto Mode](https://docs.aws.amazon.com/eks/latest/userguide/create-auto.html)
- [EKS pricing](https://aws.amazon.com/eks/pricing/)
- [Free-plan services](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html)
- [Auto Mode ALB](https://docs.aws.amazon.com/eks/latest/userguide/auto-configure-alb.html)
- [Pod Identity](https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html)
- [Metrics Server](https://docs.aws.amazon.com/eks/latest/userguide/metrics-server.html)
- [CloudFront VPC origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html)
- [WebSocket support for VPC origins](https://aws.amazon.com/about-aws/whats-new/2026/05/amazon-cloudfront-websockets-vpc-origins/)
- [CloudFront default HTTPS](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-alternate-domain-names.html)
- [CloudFront WebSocket headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-working-with.websockets.html)
