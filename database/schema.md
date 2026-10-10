# RE-LOOP — Service-owned schema reference

Generated from repository Prisma sources on 2026-09-09 / aad4092, not introspection of a running database. Service-owned files are authoritative; old database/*.prisma copies are legacy snapshots and not migration inputs.

| Service         | Provider   | Models | Source                                                             |
| --------------- | ---------- | ------ | ------------------------------------------------------------------ |
| auth-service    | postgresql | 11     | [schema](../backend/services/auth-service/prisma/schema.prisma)    |
| chat-service    | mongodb    | 2      | [schema](../backend/services/chat-service/prisma/schema.prisma)    |
| order-service   | postgresql | 6      | [schema](../backend/services/order-service/prisma/schema.prisma)   |
| product-service | postgresql | 11     | [schema](../backend/services/product-service/prisma/schema.prisma) |
| review-service  | postgresql | 1      | [schema](../backend/services/review-service/prisma/schema.prisma)  |
| support-service | postgresql | 4      | [schema](../backend/services/support-service/prisma/schema.prisma) |

Cross-service user/product/order IDs are references, not foreign keys across databases. PostgreSQL runtime uses five databases; CI may use separate schemas in one isolated test database. Mongo requires replica set transactions.

## auth-service

### enum Role

```prisma
enum Role {
  BUYER
  SELLER
  ADMIN
  TRUST_AND_SAFETY
  MARKETING
  CUSTOMER_SERVICE
  EXECUTIVE
}
```

### enum RoleCode

```prisma
enum RoleCode {
  BUYER
  SELLER
  CUSTOMER_SERVICE
  ADMIN
  TRUST_AND_SAFETY
  MARKETING
  EXECUTIVE
}
```

### enum KycStatus

```prisma
enum KycStatus {
  NONE
  PENDING
  VERIFIED
  REJECTED
  // Seller's submitted ID card has passed its expiry date â€” must re-submit KYC.
  EXPIRED
  // Seller had no listing activity for 365 days â€” must re-submit KYC to list again.
  INACTIVE_EXPIRED
}
```

### enum ReportStatus

```prisma
enum ReportStatus {
  OPEN
  REVIEWED
  ACTIONED
  DISMISSED
}
```

### model User

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  firstName    String   @map("f_name")
  lastName     String   @map("l_name")
  phone        String?
  role         Role     @default(BUYER)
  status       String   @default("ACTIVE")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  buyerProfile    BuyerProfile?
  sellerProfile   SellerProfile?
  loginLogs       LoginLog[]
  refreshTokens   RefreshToken[]
  reports         Report[]
  roles           UserRole[]
  kycApplications KycApplication[]

  @@map("users")
}
```

### model BuyerProfile

```prisma
model BuyerProfile {
  userId          String  @id @map("user_id")
  user            User    @relation(fields: [userId], references: [id])
  stylePreference String? @map("style_preference")
  sizePreference  String? @map("size_preference")
  brandPreference String? @map("brand_preference")

  @@map("buyer_profiles")
}
```

### model SellerProfile

```prisma
model SellerProfile {
  userId         String    @id @map("user_id")
  user           User      @relation(fields: [userId], references: [id])
  shopName       String    @map("shop_name")
  idCardNumber   String?   @map("id_card_number")
  // Expiry date printed on the ID card (optional â€” permanent-card holders leave this null).
  // The daily kycExpiryJob sets kycStatus = EXPIRED when this date is in the past.
  idCardExpiry   DateTime? @map("id_card_expiry")
  // Return/shipping address collected during seller verification.
  address        String?
  bankAccount    String?   @map("bank_account")
  kycStatus      KycStatus @default(NONE) @map("kyc_status")
  // Private storage key for the latest submitted ID card photo â€” never a
  // public URL, same reasoning as KycApplication.storageKey below.
  kycStorageKey  String?   @map("kyc_storage_key")
  verifiedAt     DateTime? @map("verified_at")
  // Timestamp of the seller's last listing activity (create or update a product).
  // The daily sellerInactivityJob sets kycStatus = INACTIVE_EXPIRED when this
  // (or verifiedAt if null) is older than 365 days.
  lastActiveAt   DateTime? @map("last_active_at")

  @@map("seller_profiles")
}
```

### model LoginLog

```prisma
model LoginLog {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id])
  loginAt   DateTime @default(now()) @map("login_at")
  ipAddress String?  @map("ip_address")

  @@map("login_logs")
}
```

### model RefreshToken

```prisma
model RefreshToken {
  id        String    @id @default(uuid())
  userId    String    @map("user_id")
  user      User      @relation(fields: [userId], references: [id])
  token     String    @unique
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime  @default(now()) @map("created_at")

  @@map("refresh_tokens")
}
```

### model Report

```prisma
model Report {
  id          String       @id @default(uuid())
  reporterId  String       @map("reporter_id")
  reporter    User         @relation(fields: [reporterId], references: [id])
  targetId    String?      @map("target_id")
  productId   String?      @map("product_id")
  reason      String
  status      ReportStatus @default(OPEN)
  reportedAt  DateTime     @default(now()) @map("reported_at")
  reviewedAt  DateTime?    @map("reviewed_at")
  reviewedBy  String?      @map("reviewed_by")
  actionTaken String?      @map("action_taken")

  @@map("reports")
}
```

### model AdminAudit

```prisma
model AdminAudit {
  id        String   @id @default(uuid())
  actorId   String   @map("actor_id")
  action    String
  targetId  String   @map("target_id")
  reason    String
  requestId String?  @map("request_id")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([targetId])
  @@map("admin_audits")
}
```

### model BulkActionRun

```prisma
model BulkActionRun {
  id             String   @id @default(uuid())
  idempotencyKey String   @unique @map("idempotency_key")
  actorId        String   @map("actor_id")
  action         String
  reason         String
  requestedIds   String[] @map("requested_ids")
  results        Json
  createdAt      DateTime @default(now()) @map("created_at")

  @@map("bulk_action_runs")
}
```

### model UserRole

```prisma
model UserRole {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id])
  role      RoleCode
  createdAt DateTime @default(now()) @map("created_at")

  @@unique([userId, role])
  @@map("user_roles")
}
```

### model KycApplication

```prisma
model KycApplication {
  id          String    @id @default(uuid())
  userId      String    @map("user_id")
  user        User      @relation(fields: [userId], references: [id])
  // Private filesystem key, never a public URL â€” same convention as
  // order-service's DisputeEvidence.storageKey (see evidenceStorage.js
  // there). Served only through kycRoutes' authorized stream-through route.
  storageKey  String    @map("storage_key")
  fileType    String    @map("file_type")
  status      KycStatus @default(PENDING)
  reason      String?
  version     Int       @default(1)
  submittedAt DateTime  @default(now()) @map("submitted_at")
  decidedAt   DateTime? @map("decided_at")
  decidedBy   String?   @map("decided_by")

  @@map("kyc_applications")
}
```

### model ExecutiveAuditLog

```prisma
model ExecutiveAuditLog {
  id          String   @id @default(uuid())
  actorId     String   @map("actor_id")
  actorEmail  String?  @map("actor_email")
  actorRole   String?  @map("actor_role")
  action      String   // e.g. "REPORT_EXPORT_CSV", "COMPLAINT_ACTIONED", "COMPLAINT_DISMISSED", "FINANCIAL_VIEW"
  category    String   // e.g. "DATA_EXPORT", "MODERATION", "FINANCIAL", "SECURITY"
  targetType  String?  @map("target_type") // e.g. "report", "complaint", "order"
  targetId    String?  @map("target_id")
  description String
  metadata    Json?
  ipAddress   String?  @map("ip_address")
  userAgent   String?  @map("user_agent")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([actorId])
  @@index([action])
  @@index([category])
  @@index([createdAt])
  @@map("executive_audit_logs")
}
```

## chat-service

### model Conversation

```prisma
model Conversation {
  id                 String        @id @default(auto()) @map("_id") @db.ObjectId
  contextType        String // PRODUCT | ORDER | SUPPORT | DIRECT
  contextId          String? // productId / orderId / ticketId â€” soft reference, no FK
  contextKey         String        @unique
  participants       Participant[]
  status             String        @default("ACTIVE") // ACTIVE | ARCHIVED | LOCKED
  lastMessageAt      DateTime?
  lastMessagePreview String?
  createdBy          String
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  messages Message[]

  @@index([lastMessageAt])
}
```

### type Participant

```prisma
type Participant {
  userId     String
  role       String // BUYER | SELLER | AGENT | ADMIN | SYSTEM
  joinedAt   DateTime
  lastReadAt DateTime?
  leftAt     DateTime?
}
```

### model Message

```prisma
model Message {
  id             String    @id @default(auto()) @map("_id") @db.ObjectId
  conversationId String    @db.ObjectId
  senderId       String
  senderRole     String
  type           String    @default("TEXT")
  // TEXT | IMAGE | FILE | PRODUCT_CARD | ORDER_CARD | SYSTEM
  body           String    @default("")
  // Semi-structured part â€” shape depends on `type`, see plan.md's payload
  // table. Deliberately schemaless: this is the field that lets a new
  // message type ship without a migration.
  payload        Json?
  visibility     String    @default("ALL") // ALL | INTERNAL (CS-only note, CHAT-007)
  editedAt       DateTime?
  // Soft delete only â€” messages are dispute evidence, never hard-deleted.
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id])

  @@index([conversationId, createdAt])
  @@index([conversationId, deletedAt, createdAt])
}
```

## order-service

### model Order

```prisma
model Order {
  id                   String    @id @default(uuid())
  buyerId              String    @map("buyer_id")
  sellerId             String    @map("seller_id")
  productId            String    @map("product_id")
  productTitle         String    @map("product_title")
  price                Int
  status               String    @default("pending_payment")
  reservationId        String?   @unique @map("reservation_id")
  reservationExpiresAt DateTime? @map("reservation_expires_at")
  // Set only when this order was created automatically because a buyer won
  // an auction in product-service, instead of a normal "buy now" checkout.
  // No FK â€” product-service owns the AuctionItem, this is a read-only
  // reference so metrics/support can trace an order back to its auction.
  auctionId            String?   @unique @map("auction_id")
  // WF-08 step 3: opening a dispute holds payout until CSS-003 decides.
  // Admin's hold/release writes this too â€” see adminDisputeService.
  payoutHeld           Boolean   @default(false) @map("payout_held")
  disputedAt           DateTime? @map("disputed_at")
  createdAt            DateTime  @default(now()) @map("created_at")
  updatedAt            DateTime  @updatedAt @map("updated_at")

  // ADM-004: simulated fund hold â€” no bank/payment-processor fields, mock state only
  // (ADM-DEC-003: KYC/fund hold are synthetic/simulation, never real money).
  paymentSimulationStatus String    @default("RELEASE_PENDING") @map("payment_simulation_status")
  version                 Int       @default(1)
  holdReason              String?   @map("hold_reason")
  heldAt                  DateTime? @map("held_at")
  heldBy                  String?   @map("held_by")
  preDisputeStatus        String?   @map("pre_dispute_status")

  dispute         DisputeCase?
  adminEvidence   AdminDisputeEvidence[]

  @@index([buyerId])
  @@index([sellerId])
  @@index([auctionId])
  @@index([status, reservationExpiresAt])
  @@map("orders")
}
```

### model AdminDisputeEvidence

```prisma
model AdminDisputeEvidence {
  id          String   @id @default(uuid())
  orderId     String   @map("order_id")
  order       Order    @relation(fields: [orderId], references: [id])
  evidenceRef String   @map("evidence_ref")
  note        String?
  submittedBy String   @map("submitted_by")
  submittedAt DateTime @default(now()) @map("submitted_at")

  @@index([orderId])
  @@map("admin_dispute_evidence")
}
```

### model DisputeAudit

```prisma
model DisputeAudit {
  id        String   @id @default(uuid())
  orderId   String   @map("order_id")
  actorId   String   @map("actor_id")
  action    String
  reason    String?
  createdAt DateTime @default(now()) @map("created_at")

  @@index([orderId])
  @@map("dispute_audits")
}
```

### model DisputeCase

```prisma
model DisputeCase {
  id               String    @id @default(uuid())
  orderId          String    @unique @map("order_id")
  openedBy         String    @map("opened_by")
  reason           String
  status           String    @default("OPEN") // OPEN|NEEDS_INFO|DECIDED
  decision         String? // APPROVE_REFUND|REJECT
  decisionReason   String?   @map("decision_reason")
  decidedBy        String?   @map("decided_by")
  decidedAt        DateTime? @map("decided_at")
  evidenceDeadline DateTime? @map("evidence_deadline") // WF-08 step 6: 48h to respond to an info request
  version          Int       @default(0)
  createdAt        DateTime  @default(now()) @map("created_at")

  order    Order             @relation(fields: [orderId], references: [id])
  evidence DisputeEvidence[]
  auditLog DisputeAuditLog[]

  @@map("dispute_cases")
}
```

### model DisputeAuditLog

```prisma
model DisputeAuditLog {
  id        String   @id @default(uuid())
  disputeId String   @map("dispute_id")
  actorId   String   @map("actor_id")
  action    String // OPEN|VIEW_EVIDENCE|DECIDE
  detail    String?
  createdAt DateTime @default(now()) @map("created_at")

  dispute DisputeCase @relation(fields: [disputeId], references: [id], onDelete: Cascade)

  @@index([disputeId, createdAt])
  @@map("dispute_audit_logs")
}
```

### model DisputeEvidence

```prisma
model DisputeEvidence {
  id         String   @id @default(uuid())
  disputeId  String   @map("dispute_id")
  uploaderId String   @map("uploader_id")
  storageKey String   @map("storage_key")
  fileType   String   @map("file_type")
  createdAt  DateTime @default(now()) @map("created_at")

  dispute DisputeCase @relation(fields: [disputeId], references: [id], onDelete: Cascade)

  @@index([disputeId])
  @@map("dispute_evidence")
}
```

## product-service

### model Product

```prisma
model Product {
  id                   String    @id @default(uuid())
  sellerId             String    @map("seller_id")
  title                String
  description          String    @default("")
  price                Int
  category             String
  condition            String    @default("Good")
  tags                 String[]
  location             String    @default("")
  size                 String    @default("Free size")
  status               String    @default("available")
  // BUY-xxx: a cart reservation holds the listing for 10 minutes; the expiry
  // worker in features/reservations releases it when the clock runs out.
  reservationId        String?   @unique @map("reservation_id")
  reservedBy           String?   @map("reserved_by")
  reservationExpiresAt DateTime? @map("reservation_expires_at")
  // ADM-003: set when Admin removes a listing via POST /internal/moderation/:id/remove.
  // preRemovalStatus remembers what `status` was before removal so restore can
  // put the listing back where it actually was (not force it to "available").
  moderatedAt          DateTime? @map("moderated_at")
  moderationReason     String?   @map("moderation_reason")
  preRemovalStatus     String?   @map("pre_removal_status")
  createdAt            DateTime  @default(now()) @map("created_at")
  updatedAt            DateTime  @updatedAt @map("updated_at")

  // Denormalized concat of title/description/category/condition/location/
  // size/tags, kept in sync by a DB trigger (see prisma/seed.js â€” Postgres
  // can't use a native generated column here because array_to_string() is
  // STABLE, not IMMUTABLE). This is the one field search() matches against.
  searchText  String   @default("") @map("search_text")

  photos      Photo[]
  videos      Video[]
  reviewClips ProductVideo[]
  auction     AuctionItem?

  @@index([sellerId])
  @@index([status, category])
  @@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)
  @@index([status, reservationExpiresAt])
  @@map("products")
}
```

### model Photo

```prisma
model Photo {
  id        String   @id @default(uuid())
  productId String   @map("product_id")
  url       String
  position  Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId])
  @@map("photos")
}
```

### model Video

```prisma
model Video {
  id        String   @id @default(uuid())
  productId String   @map("product_id")
  url       String
  caption   String   @default("")
  position  Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId])
  @@map("videos")
}
```

### model Category

```prisma
model Category {
  id        String   @id @default(uuid())
  name      String   @unique
  createdAt DateTime @default(now()) @map("created_at")

  @@map("categories")
}
```

### model Condition

```prisma
model Condition {
  id        String @id @default(uuid())
  value     String @unique
  label     String
  sortOrder Int    @default(0) @map("sort_order")

  @@map("conditions")
}
```

### model ProductVideo

```prisma
model ProductVideo {
  id          String   @id @default(uuid())
  videoUrl    String
  description String?
  sellerId    String   @map("seller_id")
  sellerName  String?  @map("seller_name")
  productId   String   @map("product_id")
  createdAt   DateTime @default(now()) @map("created_at")

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  choices SwipeChoice[]

  @@index([productId])
  @@index([sellerId])
  @@index([createdAt])
  @@map("product_videos")
}
```

### model SwipeChoice

```prisma
model SwipeChoice {
  id             String   @id @default(uuid())
  productVideoId String   @map("product_video_id")
  userId         String   @map("user_id")
  createdAt      DateTime @default(now()) @map("created_at")

  productVideo ProductVideo @relation(fields: [productVideoId], references: [id], onDelete: Cascade)

  // One choice per user per card â€” swiping again just confirms, doesn't duplicate.
  @@unique([productVideoId, userId])
  @@index([userId])
  @@map("swipe_choices")
}
```

### enum AuctionStatus

```prisma
enum AuctionStatus {
  draft
  pending_approval
  rejected
  approved
  scheduled
  open
  closed
  cancelled
}
```

### model AuctionItem

```prisma
model AuctionItem {
  id                String        @id @default(uuid())
  productId         String        @unique @map("product_id")
  sellerId          String        @map("seller_id")
  status            AuctionStatus @default(draft)
  // Seller-owned pricing (see MKT/marketing decision log: Seller sets these,
  // not Marketing â€” Marketing only controls the schedule).
  startingPrice     Int           @map("starting_price")
  bidIncrement      Int           @map("bid_increment")
  // Marketing-owned schedule.
  scheduledStartAt  DateTime?     @map("scheduled_start_at")
  scheduledEndAt    DateTime?     @map("scheduled_end_at")
  openedAt          DateTime?     @map("opened_at")
  closedAt          DateTime?     @map("closed_at")
  approvedBy        String?       @map("approved_by")
  approvedAt        DateTime?     @map("approved_at")
  winningBidId      String?       @unique @map("winning_bid_id")
  // Order created in order-service once the auction closes with a winner â€”
  // read via provider contract, never a cross-service DB read.
  winningOrderId    String?       @map("winning_order_id")
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  roundId           String?       @map("round_id")
  round             AuctionRound? @relation(fields: [roundId], references: [id], onDelete: SetNull)
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  bids    Bid[]   @relation("AuctionBids")

  @@index([sellerId])
  @@index([status])
  @@index([roundId])
  @@map("auction_items")
}
```

### model AuctionRound

```prisma
model AuctionRound {
  id                 String        @id @default(uuid())
  title              String
  submissionStartsAt DateTime      @map("submission_starts_at")
  submissionEndsAt   DateTime      @map("submission_ends_at")
  auctionStartsAt    DateTime      @map("auction_starts_at")
  auctionEndsAt      DateTime      @map("auction_ends_at")
  createdAt          DateTime      @default(now()) @map("created_at")
  updatedAt          DateTime      @updatedAt @map("updated_at")

  auctions           AuctionItem[]

  @@map("auction_rounds")
}
```

### model Bid

```prisma
model Bid {
  id             String      @id @default(uuid())
  auctionId      String      @map("auction_id")
  bidderId       String      @map("bidder_id")
  amount         Int
  // Client-supplied key so a retried request never creates a second bid.
  idempotencyKey String      @unique @map("idempotency_key")
  createdAt      DateTime    @default(now()) @map("created_at")

  auction AuctionItem @relation("AuctionBids", fields: [auctionId], references: [id], onDelete: Cascade)

  @@index([auctionId, amount])
  @@index([bidderId])
  @@map("bids")
}
```

### model Article

```prisma
model Article {
  id          String        @id @default(uuid())
  title       String
  slug        String?       @unique
  summary     String?       @db.Text
  content     String        @db.Text
  coverImage  String?       @map("cover_image")
  category    String        @default("general")
  status      ArticleStatus @default(draft)
  authorId    String        @map("author_id")
  authorName  String?       @map("author_name")
  searchText  String        @default("") @map("search_text")
  publishedAt DateTime?     @map("published_at")
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  @@index([status])
  @@index([category])
  @@index([status, category])
  @@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)
  @@map("articles")
}
```

### enum ArticleStatus

```prisma
enum ArticleStatus {
  draft
  published
  archived
}
```

## review-service

### model Review

```prisma
model Review {
  id        String   @id @default(uuid())
  orderId   String   @unique @map("order_id")
  buyerId   String   @map("buyer_id")
  sellerId  String   @map("seller_id")
  rating    Int
  comment   String   @default("")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([sellerId])
  @@map("reviews")
}
```

## support-service

### model SupportTicket

```prisma
model SupportTicket {
  id              String    @id @default(uuid())
  ticketNumber    String    @unique @map("ticket_number")
  requesterId     String    @map("requester_id")
  subject         String
  description     String    @default("")
  category        String // ORDER|PAYMENT|ACCOUNT|TECHNICAL|OTHER
  status          String    @default("NEW") // see ticketState.js for the transition graph
  priority        String    @default("NORMAL") // LOW|NORMAL|HIGH|URGENT â€” see sla/priority.js
  assigneeId      String?   @map("assignee_id")
  orderId         String?   @map("order_id") // soft reference to order-service â€” not a DB-level FK, different service owns it
  // Optional counterparty â€” the other party in the order this complaint is
  // about (e.g. buyer reporting a seller who never shipped). Distinct from
  // requesterId: a ticket's requester is not necessarily who's at fault, and
  // Admin needs to be able to act against the accused party, not just
  // whoever happened to file the ticket. Soft reference, same as orderId.
  targetId        String?   @map("target_id")
  slaDueAt        DateTime? @map("sla_due_at")
  firstResponseAt DateTime? @map("first_response_at")
  resolvedAt      DateTime? @map("resolved_at")
  closedAt        DateTime? @map("closed_at")
  conversationId  String?   @map("conversation_id")
  escalatedAt     DateTime? @map("escalated_at")
  // Optimistic lock: guards against two agents assigning/transitioning the
  // same ticket at once (see ticketService.js assign()).
  version         Int       @default(0)
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  messages TicketMessage[]
  auditLog TicketAuditLog[]

  @@index([status, priority, slaDueAt])
  @@index([requesterId, createdAt])
  @@index([assigneeId, status])
  @@map("support_tickets")
}
```

### model TicketMessage

```prisma
model TicketMessage {
  id         String   @id @default(uuid())
  ticketId   String   @map("ticket_id")
  authorId   String   @map("author_id")
  authorRole String   @map("author_role") // REQUESTER|AGENT|SYSTEM
  body       String
  // Internal team note â€” never returned to the requester's own view of the
  // ticket (see ticketService.js's requester-facing projection).
  isInternal Boolean  @default(false) @map("is_internal")
  createdAt  DateTime @default(now()) @map("created_at")

  ticket SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId, createdAt])
  @@map("ticket_messages")
}
```

### model TicketAuditLog

```prisma
model TicketAuditLog {
  id        String   @id @default(uuid())
  ticketId  String   @map("ticket_id")
  actorId   String   @map("actor_id")
  action    String // ASSIGN|STATUS_CHANGE|REPLY|ESCALATE
  fromValue String?  @map("from_value")
  toValue   String?  @map("to_value")
  reason    String?
  createdAt DateTime @default(now()) @map("created_at")

  ticket SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId, createdAt])
  @@map("ticket_audit_logs")
}
```

### model HelpArticle

```prisma
model HelpArticle {
  id          String    @id @default(uuid())
  slug        String    @unique
  title       String
  body        String
  category    String
  status      String    @default("DRAFT") // DRAFT|PUBLISHED|ARCHIVED
  version     Int       @default(1)
  authorId    String    @map("author_id")
  publishedAt DateTime? @map("published_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  // Trigger-maintained concat of title/body/category â€” see
  // ensureSearchTextTrigger() in prisma/seed.js and MOCK-TRADE-011's
  // productModel.js for the same pattern.
  searchText String @default("") @map("search_text")

  @@index([status, category])
  @@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)
  @@map("help_articles")
}
```
