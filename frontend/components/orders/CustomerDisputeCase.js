"use client";
import Icon from "../ui/Icon";

import { formatReferenceCode } from "../../lib/referenceCodes";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { getAccessToken, getStoredUser } from "../../lib/auth";
import {
  caseDate,
  caseStage,
  DECISION_LABELS,
  DISPUTE_TYPES,
} from "../../lib/disputePresentation";
import NavBar from "../NavBar";
import Footer from "../Footer";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import EmbeddedChat from "../support/EmbeddedChat";
import DisputeEvidence from "./DisputeEvidence";
import CsatRating from "../support/CsatRating";
import styles from "./disputeCase.module.css";

export default function CustomerDisputeCase({ orderId }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [dispute, setDispute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [room, setRoom] = useState(null);
  const [chatError, setChatError] = useState("");
  const [chatAttempt, setChatAttempt] = useState(0);
  const load = useCallback(async () => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    const data = await apiFetch(`/api/orders/disputes/by-order/${orderId}`, {
      token: getAccessToken(),
    });
    return data;
  }, [orderId, router]);
  useEffect(() => {
    let active = true;
    setUser(getStoredUser());
    setLoading(true);
    setDispute(null);
    setError(null);
    setRoom(null);
    const refresh = async () => {
      try {
        const data = await load();
        if (active && data) {
          setDispute(data);
          setError(null);
        }
      } catch (err) {
        if (active) setError(err);
      } finally {
        if (active) setLoading(false);
      }
    };
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load]);
  const order = dispute?.order;
  // A SELLER account may be this order's buyer. Resource ownership decides the side.
  const side =
    user?.id && order?.buyerId === user.id
      ? "buyer"
      : user?.id && order?.sellerId === user.id
        ? "seller"
        : null;
  useEffect(() => {
    if (!dispute?.id || !side) return;
    let active = true;
    setRoom(null);
    setChatError("");
    apiFetch(`/api/orders/disputes/${dispute.id}/conversation`, {
      method: "POST",
      token: getAccessToken(),
      body: { side },
    })
      .then((data) => {
        if (!data?.conversationId) throw new Error("ไม่พบห้องสนทนา");
        if (active) setRoom(data);
      })
      .catch((err) => {
        if (active) setChatError(err.message);
      });
    return () => {
      active = false;
    };
  }, [dispute?.id, side, chatAttempt]);
  async function refresh() {
    setRefreshing(true);
    try {
      const data = await load();
      if (data) {
        setDispute(data);
        setError(null);
      }
    } catch (err) {
      setError(err);
    } finally {
      setRefreshing(false);
    }
  }
  const stage = dispute ? caseStage(dispute) : null;
  const decided = dispute?.status === "DECIDED";
  const roles = [user?.role, ...(user?.roles || [])];
  const staff = roles.some((role) =>
    ["CUSTOMER_SERVICE", "ADMIN", "TRUST_AND_SAFETY"].includes(role),
  );
  return (
    <main className={styles.page}>
      <NavBar />
      <div className={styles.shell}>
        <Link
          href={side === "seller" ? "/seller/dashboard" : "/orders"}
          className={styles.back}
        >
          ← กลับไปยัง
          {side === "seller" ? "คำสั่งซื้อร้านค้า" : "คำสั่งซื้อของฉัน"}
        </Link>
        {loading ? (
          <div className={styles.loading} role="status">
            <div className={styles.skeleton} />
            <p>กำลังโหลดคำร้องและข้อมูลคำสั่งซื้อ…</p>
          </div>
        ) : !dispute || [403, 404].includes(error?.status) ? (
          <section className={styles.card}>
            <h1>
              {error?.status === 403
                ? "ไม่สามารถเข้าถึงคำร้องนี้"
                : error?.status === 404
                  ? "ยังไม่มีข้อพิพาทสำหรับคำสั่งซื้อนี้"
                  : "โหลดคำร้องไม่สำเร็จ"}
            </h1>
            <p className={styles.muted}>
              {error?.status === 403
                ? "คำร้องนี้เปิดให้ผู้ซื้อ ผู้ขาย และเจ้าหน้าที่ที่เกี่ยวข้องเข้าดูเท่านั้น"
                : error?.message || "กรุณาเข้าสู่ระบบแล้วลองอีกครั้ง"}
            </p>
            <Button variant="secondary" onClick={refresh} loading={refreshing}>
              ลองโหลดอีกครั้ง
            </Button>
          </section>
        ) : !side && staff ? (
          <section className={styles.card}>
            <h1>พื้นที่จัดการสำหรับเจ้าหน้าที่</h1>
            <p className={styles.muted}>
              รับเคส รวบรวมหลักฐาน และพิจารณาตามสิทธิ์ของคุณในพื้นที่ทำงาน
            </p>
            <Button href="/workspace">ไปยังพื้นที่ทำงาน</Button>
          </section>
        ) : !side ? (
          <Alert tone="error">
            คุณไม่ได้เป็นผู้ซื้อหรือผู้ขายของคำสั่งซื้อนี้
          </Alert>
        ) : (
          <>
            <header className={styles.hero}>
              <div>
                <span className={styles.eyebrow}>
                  ศูนย์ช่วยเหลือ · สำหรับ
                  {side === "buyer" ? "ผู้ซื้อ" : "ผู้ขาย"}
                </span>
                <h1>ข้อพิพาทคำสั่งซื้อ</h1>
                <p>ส่งข้อมูล ติดตามเรื่อง และพูดคุยกับเจ้าหน้าที่ในที่เดียว</p>
              </div>
              <div className={styles.heroActions}>
                <span className={`${styles.badge} ${styles[stage.tone]}`}>
                  {stage.label}
                </span>
                <Button
                  variant="secondary"
                  icon="refresh"
                  loading={refreshing}
                  onClick={refresh}
                >
                  อัปเดตสถานะ
                </Button>
              </div>
            </header>
            {error && (
              <Alert tone="error">
                อัปเดตข้อมูลไม่สำเร็จ: {error.message}{" "}
                ข้อมูลที่แสดงเป็นข้อมูลล่าสุดที่โหลดได้
              </Alert>
            )}
            <ol className={styles.steps} aria-label="ขั้นตอนการพิจารณา">
              {["เปิดคำร้อง", "รวบรวมหลักฐาน", "Trust and Safety พิจารณา", "แจ้งผล"].map(
                (label, index) => (
                  <li
                    key={label}
                    className={index <= stage.step ? styles.reached : ""}
                    aria-current={index === stage.step ? "step" : undefined}
                  >
                    <span>
                      {index < stage.step || decided ? (
                        <Icon name="check" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <strong>{label}</strong>
                  </li>
                ),
              )}
            </ol>
            <div className={styles.layout}>
              <div className={styles.mainColumn}>
                {decided && (
                  <section
                    className={`${styles.card} ${styles.verdict}`}
                    aria-labelledby="verdict-heading"
                  >
                    <span className={styles.eyebrow}>ผลการพิจารณา</span>
                    <h2 id="verdict-heading">
                      {DECISION_LABELS[dispute.decision] || dispute.decision}
                    </h2>
                    <p>
                      {dispute.decisionReason ||
                        "เจ้าหน้าที่พิจารณาข้อมูลของทั้งสองฝ่ายเรียบร้อยแล้ว"}
                    </p>
                    <time>{caseDate(dispute.decidedAt)}</time>
                  </section>
                )}
                {decided && side && (
                  <CsatRating
                    key={`${dispute.id}:${user?.id}`}
                    endpoint={`/api/orders/disputes/${dispute.id}/csat`}
                    caseLabel="ข้อพิพาทนี้"
                  />
                )}
                <section className={styles.card}>
                  <div className={styles.cardHeading}>
                    <div>
                      <span className={styles.eyebrow}>รายละเอียดคำร้อง</span>
                      <h2>
                        {DISPUTE_TYPES.find(
                          ([key]) => key === dispute.disputeType,
                        )?.[1] ||
                          dispute.disputeType ||
                          "ปัญหาเกี่ยวกับสินค้า"}
                      </h2>
                    </div>
                    <span className={styles.subtle}>เปิดโดยผู้ซื้อ</span>
                  </div>
                  <p className={styles.reason}>{dispute.reason}</p>
                </section>
                <section className={styles.card} aria-labelledby="chat-heading">
                  <div className={styles.cardHeading}>
                    <div>
                      <span className={styles.eyebrow}>
                        คำชี้แจงและความคืบหน้า
                      </span>
                      <h2 id="chat-heading">สนทนากับเจ้าหน้าที่ CS</h2>
                    </div>
                    <span className={styles.privateLabel}>
                      <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        lock
                      </span>
                      ห้องของ{side === "buyer" ? "ผู้ซื้อ" : "ผู้ขาย"}
                    </span>
                  </div>
                  <p className={styles.muted}>
                    บทสนทนานี้แยกจากอีกฝ่าย CS
                    จะรวบรวมคำชี้แจงก่อนส่งให้ Trust and Safety พิจารณา
                  </p>
                  {chatError ? (
                    <Alert tone="error">
                      เปิดบทสนทนาไม่สำเร็จ: {chatError}
                      <div className="mt-3">
                        <Button
                          variant="secondary"
                          onClick={() => setChatAttempt((value) => value + 1)}
                        >
                          ลองเปิดแชตอีกครั้ง
                        </Button>
                      </div>
                    </Alert>
                  ) : !room ? (
                    <p className={styles.empty} role="status">
                      กำลังเปิดห้องสนทนาของคุณ…
                    </p>
                  ) : (
                    <div className={styles.chat}>
                      <EmbeddedChat
                        conversationId={room.conversationId}
                        maxHeight="480px"
                        hideInternal
                        readOnly={room.readOnly || decided}
                        otherName="เจ้าหน้าที่ CS"
                        draftKey={`dispute-${dispute.id}-${side}`}
                      />
                    </div>
                  )}
                  {decided && (
                    <p className={styles.closedNote}>
                      ปิดการส่งข้อความหลังพิจารณาแล้ว บทสนทนาเดิมยังเปิดอ่านได้
                    </p>
                  )}
                </section>
                <DisputeEvidence
                  dispute={dispute}
                  userId={user.id}
                  onUploaded={refresh}
                />
              </div>
              <aside className={styles.sidebar}>
                <section className={styles.nextStep}>
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                  >
                    {decided ? "task_alt" : "support_agent"}
                  </span>
                  <h2>
                    {decided
                      ? "คำร้องดำเนินการเสร็จแล้ว"
                      : side === "seller"
                        ? "ส่งคำชี้แจงของร้านค้า"
                        : "สิ่งที่คุณทำได้ตอนนี้"}
                  </h2>
                  <p>{stage.description}</p>
                </section>
                <section className={styles.card}>
                  <span className={styles.eyebrow}>ข้อมูลคำสั่งซื้อ</span>
                  <h2 className={styles.orderTitle}>
                    {order.productTitle || "สินค้าในคำสั่งซื้อ"}
                  </h2>
                  <dl className={styles.facts}>
                    <div>
                      <dt>ยอดคำสั่งซื้อ</dt>
                      <dd className={styles.amount}>
                        ฿
                        {Number(
                          order.finalPrice ??
                            order.ordersAmount ??
                            order.price ??
                            0,
                        ).toLocaleString("th-TH")}
                      </dd>
                    </div>
                    <div>
                      <dt>เปิดคำร้องเมื่อ</dt>
                      <dd>{caseDate(dispute.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>เลขคำสั่งซื้อ</dt>
                      <dd className={styles.identifier}>{orderId}</dd>
                    </div>
                    <div>
                      <dt>เลขคำร้อง</dt>
                      <dd className={styles.identifier}>{formatReferenceCode(dispute)}</dd>
                    </div>
                  </dl>
                  <Link
                    href={`/products/${order.productId}`}
                    className={styles.detailLink}
                  >
                    ดูรายละเอียดสินค้า <Icon name="open_in_new" />
                  </Link>
                </section>
                <section className={styles.card}>
                  <h2>ความคืบหน้าของเรื่อง</h2>
                  <ol className={styles.timeline}>
                    <li>
                      <strong>เปิดคำร้องแล้ว</strong>
                      <time>{caseDate(dispute.createdAt)}</time>
                    </li>
                    {dispute.assignedAt && (
                      <li>
                        <strong>เจ้าหน้าที่รับเรื่อง</strong>
                        <time>{caseDate(dispute.assignedAt)}</time>
                      </li>
                    )}
                    {["ADMIN", "TRUST_AND_SAFETY"].includes(dispute.assignedRole) && (
                      <li>
                        <strong>ส่งต่อให้ Trust and Safety พิจารณา</strong>
                      </li>
                    )}
                    {decided && (
                      <li>
                        <strong>แจ้งผลการพิจารณา</strong>
                        <time>{caseDate(dispute.decidedAt)}</time>
                      </li>
                    )}
                  </ol>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
      <Footer />
    </main>
  );
}
