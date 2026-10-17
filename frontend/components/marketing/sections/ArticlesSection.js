"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Button from "../../ui/Button";
import Modal from "../../ui/Modal";
import EmptyState from "../../ui/EmptyState";
import ErrorState from "../../ui/ErrorState";
import Skeleton from "../../ui/Skeleton";
import ConfirmDialog from "../../ui/ConfirmDialog";
import DropdownFilter from "../../panel/ui/DropdownFilter";
import RadioSelect from "../../ui/RadioSelect";
import { apiFetch, uploadFiles, mediaUrl } from "../../../lib/api";
import { MARKETING_PAGE_SIZE } from "../marketingConstants";
import MarketingPagination from "./MarketingPagination";

const CATEGORY_OPTIONS = [
  { value: "care", label: "การดูแลเสื้อผ้า (Care Guide)" },
  { value: "styling", label: "เคล็ดลับการแต่งตัว (Styling Tips)" },
  { value: "sustainability", label: "แฟชั่นยั่งยืน & Eco (Sustainability)" },
  { value: "general", label: "สาระน่ารู้ทั่วไป (General)" },
];

const CATEGORY_FILTER_OPTIONS = [
  { value: "", label: "ทุกหมวดหมู่" },
  ...CATEGORY_OPTIONS,
];

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "published", label: "เผยแพร่แล้ว" },
  { value: "draft", label: "ฉบับร่าง" },
  { value: "archived", label: "เก็บถาวร" },
];

const ARTICLE_STATUS_OPTIONS = [
  { value: "published", label: "🟢 เผยแพร่ทันที (Published)" },
  { value: "draft", label: "⚪ บันทึกเป็นฉบับร่าง (Draft)" },
];

const CATEGORY_MAP = {
  care: {
    label: "การดูแลเสื้อผ้า",
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  styling: {
    label: "เคล็ดลับการแต่งตัว",
    color: "bg-purple-50 text-purple-700 border-purple-200",
  },
  sustainability: {
    label: "แฟชั่นยั่งยืน",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  general: {
    label: "สาระน่ารู้",
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

export default function ArticlesSection({ token }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statSummary, setStatSummary] = useState(null);

  // Editor modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("care");
  const [status, setStatus] = useState("published");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const fileInputRef = useRef(null);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState("");

  function showToast(msg) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  }

  async function loadArticles(pageToLoad = page) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (q.trim()) params.set("q", q.trim());
      params.set("page", pageToLoad);
      params.set("limit", MARKETING_PAGE_SIZE);

      const data = await apiFetch(
        `/api/products/articles/marketing/all?${params}`,
        { token },
      );
      const items = data.items || [];
      const totalCount = data.total ?? items.length;
      const calculatedTotalPages = Math.max(
        1,
        data.totalPages ?? Math.ceil(totalCount / MARKETING_PAGE_SIZE),
      );

      if (calculatedTotalPages > 0 && pageToLoad > calculatedTotalPages) {
        setPage(calculatedTotalPages);
        loadArticles(calculatedTotalPages);
        return;
      }

      setArticles(items);
      setTotal(totalCount);
      setTotalPages(calculatedTotalPages);
      setStatSummary(data.summary || null);
    } catch (err) {
      console.error("Failed to load marketing articles:", err);
      setError(err.message || "ไม่สามารถดึงข้อมูลบทความได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    loadArticles(1);
  }, [token, statusFilter, categoryFilter]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadArticles(1);
  }

  function openCreateModal() {
    setEditingArticle(null);
    setTitle("");
    setCategory("care");
    setStatus("published");
    setSummary("");
    setContent("");
    setCoverImage("");
    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(article) {
    setEditingArticle(article);
    setTitle(article.title || "");
    setCategory(article.category || "care");
    setStatus(article.status || "draft");
    setSummary(article.summary || "");
    setContent(article.content || "");
    setCoverImage(article.coverImage || "");
    setFormError("");
    setModalOpen(true);
  }

  async function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setFormError("");
    try {
      const uploaded = await uploadFiles([file], token);
      if (uploaded && uploaded[0]?.url) {
        setCoverImage(uploaded[0].url);
        showToast("อัปโหลดรูปภาพปกสำเร็จ");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setFormError("อัปโหลดรูปภาพไม่สำเร็จ: " + err.message);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!title.trim()) {
      setFormError("กรุณาระบุชื่อหัวข้อบทความ");
      return;
    }
    if (!content.trim()) {
      setFormError("กรุณาระบุเนื้อหาบทความ");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const payload = {
        title: title.trim(),
        summary: summary.trim(),
        content: content.trim(),
        category,
        status,
        coverImage: coverImage || null,
      };

      if (editingArticle) {
        await apiFetch(`/api/products/articles/${editingArticle.id}`, {
          method: "PUT",
          body: payload,
          token,
        });
        showToast("แก้ไขบทความเรียบร้อยแล้ว");
      } else {
        await apiFetch("/api/products/articles", {
          method: "POST",
          body: payload,
          token,
        });
        showToast("สร้างบทความใหม่สำเร็จ");
      }

      setModalOpen(false);
      loadArticles();
    } catch (err) {
      console.error("Save error:", err);
      setFormError(err.message || "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/products/articles/${deleteTarget.id}`, {
        method: "DELETE",
        token,
      });
      showToast("ลบบทความเรียบร้อยแล้ว");
      setDeleteTarget(null);
      loadArticles();
    } catch (err) {
      console.error("Delete error:", err);
      alert("ลบไม่สำเร็จ: " + err.message);
    } finally {
      setDeleting(false);
    }
  }

  // Stats calculation (aggregated across dataset before pagination)
  const totalCount = statSummary?.total ?? total ?? articles.length;
  const publishedCount =
    statSummary?.published ??
    articles.filter((a) => a.status === "published").length;
  const draftCount =
    statSummary?.draft ??
    articles.filter((a) => a.status === "draft").length;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 max-w-[calc(100vw-2rem)] sm:max-w-md z-50 flex items-center gap-2 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-2">
          <span className="material-symbols-outlined text-[18px] text-emerald-400 shrink-0">
            check_circle
          </span>
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
              <span className="material-symbols-outlined text-[18px]">
                menu_book
              </span>
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              จัดการบทความ & คอนเทนต์ความรู้
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            สร้างและเผยแพร่บทความให้ความรู้ เคล็ดลับการแต่งตัว
            และสาระแฟชั่นยั่งยืนสำหรับชุมชน RE-LOOP (ST-MKT-05)
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
          <Link
            href="/articles"
            target="_blank"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 transition-colors text-center"
          >
            <span className="material-symbols-outlined text-[16px]">
              open_in_new
            </span>
            ดูหน้าบทความสาธารณะ
          </Link>
          <Button
            variant="primary"
            onClick={openCreateModal}
            icon="add"
            className="w-full sm:w-auto justify-center"
          >
            เขียนบทความใหม่
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">
              บทความทั้งหมด
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {totalCount}
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
            <span className="material-symbols-outlined text-[20px]">
              article
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-emerald-600 font-medium">
              เผยแพร่แล้ว (Published)
            </div>
            <div className="text-2xl font-black text-emerald-700 mt-1">
              {publishedCount}
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <span className="material-symbols-outlined text-[20px]">
              check_circle
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-amber-600 font-medium">
              ฉบับร่าง (Draft)
            </div>
            <div className="text-2xl font-black text-amber-700 mt-1">
              {draftCount}
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <span className="material-symbols-outlined text-[20px]">
              edit_note
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full lg:max-w-xs">
          <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-[18px]">
            search
          </span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อเรื่องหรือเนื้อหา..."
            className="h-[34px] w-full pl-8 pr-8 rounded-lg bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 text-slate-800"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                loadArticles();
              }}
              aria-label="ล้างคำค้นหา"
              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
            >
              <span className="material-symbols-outlined text-[16px]">
                close
              </span>
            </button>
          )}
        </form>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full lg:w-auto">
          <DropdownFilter
            options={CATEGORY_FILTER_OPTIONS}
            value={categoryFilter}
            onChange={setCategoryFilter}
            ariaLabel="ตัวกรองหมวดหมู่"
            placeholder="ทุกหมวดหมู่"
            size="sm"
            className="w-full sm:w-44 shrink-0"
          />

          <DropdownFilter
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="ตัวกรองสถานะ"
            placeholder="ทุกสถานะ"
            size="sm"
            className="w-full sm:w-36 shrink-0"
          />

          <Button
            variant="secondary"
            size="sm"
            onClick={loadArticles}
            icon="refresh"
            aria-label="รีเฟรชข้อมูลบทความ"
            className="w-full sm:w-auto justify-center shrink-0 h-[34px] px-3 text-xs"
          >
            รีเฟรช
          </Button>
        </div>
      </div>

      {/* Articles Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4 items-center">
                <Skeleton className="h-16 w-24 rounded-lg shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-8">
            <ErrorState description={error} onRetry={loadArticles} />
          </div>
        ) : articles.length === 0 ? (
          <div className="p-12">
            <EmptyState
              title="ยังไม่มีบทความ"
              description="ยังไม่พบบทความตามเงื่อนไขที่เลือก คลิกปุ่ม 'เขียนบทความใหม่' เพื่อเริ่มลงบทความแรกของคุณ"
              action={
                <Button variant="primary" onClick={openCreateModal} icon="add">
                  เขียนบทความใหม่
                </Button>
              }
            />
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full table-fixed text-left text-xs text-slate-600">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[13%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200/80 uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="px-3 py-3.5">บทความ</th>
                  <th className="px-2 py-3.5">หมวดหมู่</th>
                  <th className="px-2 py-3.5">สถานะ</th>
                  <th className="px-2 py-3.5 text-right">ผู้อ่าน</th>
                  <th className="px-2 py-3.5">ผู้เขียน</th>
                  <th className="px-2 py-3.5">วันที่สร้าง</th>
                  <th className="px-3 py-3.5 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {articles.map((article) => {
                  const catInfo = CATEGORY_MAP[article.category] || {
                    label: article.category,
                    color: "bg-slate-100 text-slate-700 border-slate-200",
                  };
                  const isPublished = article.status === "published";

                  return (
                    <tr
                      key={article.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Image & Title */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-10 w-14 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                            {article.coverImage ? (
                              <img
                                src={mediaUrl(article.coverImage)}
                                alt={article.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-slate-300">
                                <span className="material-symbols-outlined text-[18px]">
                                  menu_book
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div
                              className="font-bold text-slate-900 truncate hover:text-brand-600 cursor-pointer"
                              title={article.title}
                              onClick={() => openEditModal(article)}
                            >
                              {article.title}
                            </div>
                            {article.summary && (
                              <p
                                className="text-[11px] text-slate-500 truncate mt-0.5"
                                title={article.summary}
                              >
                                {article.summary}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-2 py-3">
                        <span
                          className={`inline-flex max-w-full truncate px-2.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${catInfo.color}`}
                          title={catInfo.label}
                        >
                          {catInfo.label}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-2 py-3">
                        {isPublished ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                            เผยแพร่แล้ว
                          </span>
                        ) : article.status === "archived" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                            เก็บถาวร
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                            ฉบับร่าง
                          </span>
                        )}
                      </td>

                      {/* Unique readers */}
                      <td className="px-2 py-3 text-right whitespace-nowrap">
                        <span className="inline-flex items-center justify-end gap-1 font-semibold text-slate-700">
                          <span
                            className="material-symbols-outlined text-[16px] text-slate-400"
                            aria-hidden="true"
                          >
                            visibility
                          </span>
                          {Number(article.viewCount || 0).toLocaleString("th-TH")}
                        </span>
                      </td>

                      {/* Author */}
                      <td className="px-2 py-3 text-slate-700">
                        <span
                          className="block truncate text-xs"
                          title={article.authorName || "ทีมการตลาด"}
                        >
                          {article.authorName || "ทีมการตลาด"}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-2 py-3 text-slate-500 whitespace-nowrap text-[11px]">
                        {new Date(article.createdAt).toLocaleDateString(
                          "th-TH",
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          },
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {isPublished && (
                            <Link
                              href={`/articles/${article.id}`}
                              target="_blank"
                              title="ดูหน้าบทความ"
                              aria-label={`ดูบทความ ${article.title}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                visibility
                              </span>
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(article)}
                            title="แก้ไขบทความ"
                            aria-label={`แก้ไขบทความ ${article.title}`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              edit
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(article)}
                            title="ลบบทความ"
                            aria-label={`ลบบทความ ${article.title}`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              delete
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <MarketingPagination
          page={page}
          totalPages={totalPages}
          total={total}
          loading={loading}
          error={error}
          onPageChange={(p) => {
            setPage(p);
            loadArticles(p);
          }}
        />
      </div>

      {/* Editor Modal (Create / Edit) */}
      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingArticle ? "แก้ไขบทความ" : "เขียนบทความใหม่"}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4 pt-2">
          {formError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">
                error
              </span>
              {formError}
            </div>
          )}

          {/* Cover Image Uploader */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              รูปภาพหน้าปกบทความ (Cover Image)
            </label>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="relative h-32 w-full sm:w-48 max-w-xs rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                {coverImage ? (
                  <>
                    <img
                      src={mediaUrl(coverImage)}
                      alt="Cover Preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setCoverImage("")}
                      className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        close
                      </span>
                    </button>
                  </>
                ) : (
                  <div className="text-center p-2 text-slate-400">
                    <span className="material-symbols-outlined text-[28px]">
                      add_photo_alternate
                    </span>
                    <span className="block text-[11px] mt-1">
                      ยังไม่มีรูปภาพ
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2 w-full">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={uploadingImage}
                    onClick={() => fileInputRef.current?.click()}
                    icon="upload"
                  >
                    {uploadingImage
                      ? "กำลังอัปโหลด..."
                      : "เลือกรูปภาพจากเครื่อง"}
                  </Button>
                </div>
                <div className="text-[11px] text-slate-500">
                  หรือวาง URL ของรูปภาพโดยตรง:
                </div>
                <input
                  type="text"
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              ชื่อหัวข้อบทความ (Title) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น 5 วิธีดูแลเสื้อผ้ามือสองให้เหมือนใหม่"
              required
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 font-medium text-slate-900"
            />
          </div>

          {/* Category & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="article-category-select"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                หมวดหมู่บทความ (Category)
              </label>
              <RadioSelect
                id="article-category-select"
                name="articleCategory"
                value={category}
                onChange={setCategory}
                options={CATEGORY_OPTIONS}
                variant="form"
                size="sm"
                className="w-full"
                buttonClassName="w-full"
                nativeAriaLabel="เลือกหมวดหมู่บทความ"
              />
            </div>

            <div>
              <label
                htmlFor="article-status-select"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                สถานะการเผยแพร่ (Status)
              </label>
              <RadioSelect
                id="article-status-select"
                name="articleStatus"
                value={status}
                onChange={setStatus}
                options={ARTICLE_STATUS_OPTIONS}
                variant="form"
                size="sm"
                className="w-full"
                buttonClassName="w-full"
                nativeAriaLabel="เลือกสถานะการเผยแพร่"
              />
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              คำโปรยสั้นๆ (Summary / Excerpt)
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="สรุปประเด็นสำคัญสั้นๆ 1-2 บรรทัด สำหรับแสดงในการ์ดหน้ารวม..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>

          {/* Content Body */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
              <label className="text-xs font-semibold text-slate-800">
                เนื้อหาบทความแบบละเอียด (Content){" "}
                <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">
                รองรับหัวข้อย่อย (###), รายการ (*), ตัวหนา (**ข้อความ**)
              </span>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={9}
              required
              placeholder="พิมพ์เนื้อหาบทความที่นี่... รองรับการแบ่งย่อหน้าอย่างอิสระ"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs leading-relaxed font-sans focus:outline-none focus:ring-2 focus:ring-brand-500/40 font-normal"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="w-full sm:w-auto justify-center"
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              icon="check"
              className="w-full sm:w-auto justify-center"
            >
              {editingArticle ? "บันทึกการแก้ไข" : "บันทึกบทความ"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="ยืนยันการลบบทความ"
        message={`คุณต้องการลบบทความ "${deleteTarget?.title}" ใช่หรือไม่? การกระทำนี้ไม่สามารถเรียกคืนได้`}
        confirmLabel="ลบบทความ"
        cancelLabel="ยกเลิก"
        danger
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
