"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api";
import DataTable from "../../../ui/DataTable";
import Alert from "../../../ui/Alert";
import Pagination from "../../../Pagination";

export default function BannedAccountHistory({ token, onOpenAccount, refreshKey = 0 }) {
  const [role, setRole] = useState("ALL");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page, limit: 10, role });
    if (search) params.set("q", search);
    apiFetch(`/api/auth/admin/users/ban-history?${params}`, { token })
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) { setData({ items: [], total: 0, totalPages: 1 }); setError(err.message || "โหลดประวัติการแบนไม่สำเร็จ"); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, role, search, page, refreshKey, retry]);

  const columns = [
    { key: "targetId", header: "เลขลูกค้า / ร้านค้า", render: (row) => <button type="button" onClick={() => onOpenAccount(row.targetId)} className="break-all text-left font-mono text-xs font-semibold text-emerald-700 underline">{row.targetId}</button> },
    { key: "account", header: "ลูกค้า / ร้านค้า", render: ({ account }) => <div className="text-left"><p className="font-semibold">{[account.firstName, account.lastName].filter(Boolean).join(" ") || "ไม่ระบุชื่อ"}</p>{account.sellerProfile?.shopName && <p className="text-xs text-slate-500">ร้าน {account.sellerProfile.shopName}</p>}</div> },
    { key: "role", header: "ประเภท", render: ({ account }) => {
      const roles = account.roles?.length ? account.roles.map((item) => item.role) : [account.role];
      return [roles.includes("BUYER") && "ลูกค้า", roles.includes("SELLER") && "ร้านค้า"].filter(Boolean).join(" / ");
    } },
    { key: "createdAt", header: "วันที่แบน", render: (row) => new Date(row.createdAt).toLocaleString("th-TH") },
    { key: "reason", header: "เหตุผล", className: "max-w-xs whitespace-normal break-words text-left" },
    { key: "actor", header: "ผู้ดำเนินการ", render: (row) => [row.actor?.firstName, row.actor?.lastName].filter(Boolean).join(" ") || "ไม่ระบุ" },
    { key: "status", header: "สถานะปัจจุบัน", render: ({ account }) => <span className={account.status === "SUSPENDED" ? "font-semibold text-red-700" : "text-slate-600"}>{account.status === "SUSPENDED" ? "ถูกแบน" : "ปลดแบนแล้ว"}</span> },
  ];

  return <section className="mt-8 w-full max-w-7xl rounded-xl border border-slate-200 bg-white p-4 text-left sm:p-6" aria-labelledby="ban-history-title">
    <h3 id="ban-history-title" className="text-lg font-bold text-slate-900">ประวัติการแบนลูกค้าและร้านค้า</h3>
    <p className="mt-1 text-sm text-slate-500">รวมบัญชีที่เคยถูกแบนและสถานะปัจจุบัน กดเลขบัญชีเพื่อเปิดรายละเอียดและประวัติ</p>
    <div className="my-4 flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="ประเภทบัญชีในประวัติการแบน">
        {[["ALL", "ทั้งหมด"], ["BUYER", "ลูกค้า"], ["SELLER", "ร้านค้า"]].map(([value, label]) => <button key={value} type="button" aria-pressed={role === value} onClick={() => { setRole(value); setPage(1); }} className={`rounded-lg px-3 py-2 text-sm font-medium ${role === value ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>{label}</button>)}
      </div>
      <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setPage(1); }}>
        <input aria-label="ค้นหาประวัติการแบน" placeholder="เลขบัญชี ชื่อลูกค้า หรือชื่อร้านค้า" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">ค้นหาประวัติ</button>
      </form>
      <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-lg border px-3 py-2 text-sm">รีเฟรชประวัติ</button>
    </div>
    {error ? <Alert>{error} <button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-2 font-semibold underline">ลองใหม่</button></Alert> : <>
      <p className="mb-3 text-sm text-slate-500">ประวัติการแบน {data.total || 0} ครั้ง</p>
      <DataTable columns={columns} rows={data.items || []} loading={loading} empty={<p className="py-6 text-slate-500">ไม่พบประวัติการแบนที่ตรงกับเงื่อนไข ลองเปลี่ยนประเภทบัญชีหรือคำค้นหา</p>} />
      <Pagination page={page} totalPages={data.totalPages || 1} onChange={setPage} />
    </>}
  </section>;
}
