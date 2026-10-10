"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import config from "../../../lib/customerServiceConfig";
import Pagination from "../../Pagination";
import Button from "../../ui/Button";
import DropdownFilter from "../../panel/ui/DropdownFilter";
import FaqArticleCard from "./faq/FaqArticleCard";
import FaqEditor from "./faq/FaqEditor";
import Modal from "../../ui/Modal";

const STATUS_OPTIONS = [
  { value: "", label: "ทั้งหมด" },
  { value: "DRAFT", label: "ฉบับร่าง" },
  { value: "PUBLISHED", label: "เผยแพร่แล้ว" },
];

export default function FaqSection({ token }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    items: [],
    totalPages: 1,
    loading: true,
    error: "",
  });
  const [editor, setEditor] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [deletingArticle, setDeletingArticle] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [publishingId, setPublishingId] = useState(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setState({ items: [], totalPages: 1, loading: true, error: "" });
    const params = new URLSearchParams({
      page,
      limit: config.pagination.articles,
    });
    if (status) params.set("status", status);
    apiFetch(`/api/support/help/manage?${params}`, {
      token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!Array.isArray(data.items) || !Number.isInteger(data.totalPages))
          throw new Error("Invalid article response");
        if (controller.signal.aborted) return;
        if (page > data.totalPages) {
          setPage(data.totalPages);
          return;
        }
        setState({
          items: data.items,
          totalPages: data.totalPages,
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            items: [],
            totalPages: 1,
            loading: false,
            error: error.message,
          });
      });
    return () => controller.abort();
  }, [token, status, page, revision]);

  async function create(form) {
    setSubmitting(true);
    setActionError("");
    try {
      await apiFetch(
        editingArticle
          ? `/api/support/help/${editingArticle.id}/revisions`
          : "/api/support/help",
        {
          method: "POST",
          token,
          body: form,
        },
      );
      setEditor(false);
      setPage(1);
      setRevision((value) => value + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function publish(id) {
    setPublishingId(id);
    setActionError("");
    try {
      await apiFetch(`/api/support/help/${id}/publish`, {
        method: "PATCH",
        token,
      });
      setRevision((value) => value + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setPublishingId(null);
    }
  }

  async function remove() {
    setSubmitting(true);
    setActionError("");
    try {
      await apiFetch(`/api/support/help/${deletingArticle.id}`, {
        method: "DELETE",
        token,
      });
      setDeletingArticle(null);
      setRevision((value) => value + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in-up flex min-h-full flex-col">
      <div className="mb-5 flex items-center justify-between gap-3">
        <DropdownFilter
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <Button
          icon="add"
          onClick={() => {
            setEditor(true);
            setEditingArticle(null);
            setActionError("");
          }}
        >
          เขียนบทความใหม่
        </Button>
      </div>
      {(state.error || (!editor && !deletingArticle && actionError)) && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {state.error || actionError}
        </p>
      )}
      {state.error && (
        <Button
          variant="secondary"
          onClick={() => setRevision((value) => value + 1)}
        >
          ลองใหม่
        </Button>
      )}
      {state.loading && (
        <p role="status" className="text-sm text-gray-500">
          กำลังโหลด...
        </p>
      )}
      {!state.loading && !state.error && !state.items.length && (
        <p className="text-sm text-gray-500">ยังไม่มีบทความในหมวดนี้</p>
      )}
      <ul className="flex flex-col gap-2">
        {state.items.map((article) => (
          <FaqArticleCard
            key={article.id}
            article={article}
            publishing={publishingId === article.id}
            onPublish={publish}
            onEdit={(article) => {
              setEditingArticle(article);
              setActionError("");
              setEditor(true);
            }}
            onDelete={(article) => {
              setDeletingArticle(article);
              setActionError("");
            }}
          />
        ))}
      </ul>
      {!state.loading && (
        <Pagination
          page={page}
          totalPages={state.totalPages}
          onChange={setPage}
        />
      )}
      {editor && (
        <FaqEditor
          open
          token={token}
          busy={submitting}
          error={actionError}
          onClose={() => setEditor(false)}
          onSubmit={create}
          article={editingArticle}
        />
      )}
      <Modal
        open={Boolean(deletingArticle)}
        title="ยืนยันการลบ FAQ"
        onClose={submitting ? undefined : () => setDeletingArticle(null)}
      >
        <p className="mb-4">
          ลบบทความ “{deletingArticle?.title}” ออกจากรายการและหน้าช่วยเหลือ?
        </p>
        {actionError && (
          <p role="alert" className="mb-3 text-sm text-red-700">
            {actionError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={submitting}
            onClick={() => setDeletingArticle(null)}
          >
            ยกเลิก
          </Button>
          <Button variant="danger" disabled={submitting} onClick={remove}>
            {submitting ? "กำลังลบ..." : "ยืนยันลบ"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
