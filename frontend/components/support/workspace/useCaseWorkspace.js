"use client";
import config from "../../../lib/customerServiceConfig";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../../lib/api";

const snapshots = new Map();
const defaults = {
  view: "workspace",
  scope: "mine",
  search: "",
  status: "",
  priority: "",
  work: "",
  sort: "sla",
  page: 1,
  selectedId: null,
  side: "buyer",
};
function writeLocation(domain, state, replace = false) {
  const params = new URLSearchParams(window.location.search);
  [
    "view",
    "scope",
    "sort",
    "side",
    "status",
    "priority",
    "work",
    "page",
    "case",
    "q",
  ].forEach((key) => params.delete(key));
  params.set("section", domain);
  if (["tickets", "disputes"].includes(domain)) {
    [
      "view",
      "scope",
      "sort",
      "side",
      "status",
      "priority",
      "work",
      "page",
    ].forEach((key) => {
      if (state[key]) params.set(key, String(state[key]));
    });
    if (state.selectedId) params.set("case", state.selectedId);
    if (state.search) params.set("q", state.search);
  }
  window.history[replace ? "replaceState" : "pushState"](
    null,
    "",
    `?${params}`,
  );
}
export function navigateWorkspaceSection(
  domain,
  account,
  status,
  overrides = {},
) {
  const state = { ...defaults, ...snapshots.get(account + ":" + domain) };
  if (status !== undefined) {
    state.status = status || "";
    state.work = "";
    state.page = 1;
    state.selectedId = null;
    state.scope = "all";
  }
  Object.assign(state, overrides);
  snapshots.set(account + ":" + domain, state);
  writeLocation(domain, state);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
function parseState(domain, account) {
  let result = { ...defaults, ...snapshots.get(account + ":" + domain) };
  if (typeof window === "undefined") return result;
  const params = new URLSearchParams(window.location.search);
  if (params.get("section") !== domain) return result;
  const enums = {
    view: ["workspace", "table"],
    scope: ["mine", "unassigned", "all"],
    sort: ["sla", "newest", "oldest", "priority"],
    side: ["buyer", "seller"],
    work: ["", "open", "overdue", "soon", "reply"],
  };
  Object.entries(enums).forEach(([key, values]) => {
    if (values.includes(params.get(key))) result[key] = params.get(key);
  });
  const statuses =
    domain === "tickets"
      ? [
          "",
          "NEW",
          "ASSIGNED",
          "IN_PROGRESS",
          "PENDING_USER",
          "RESOLVED",
          "CLOSED",
        ]
      : ["", "OPEN", "NEEDS_INFO", "DECIDED"];
  result.status = statuses.includes(params.get("status"))
    ? params.get("status")
    : "";
  result.priority = ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"].includes(
    params.get("priority"),
  )
    ? params.get("priority")
    : "";
  result.search = params.get("q") || "";
  result.page = Math.max(1, Number.parseInt(params.get("page"), 10) || 1);
  result.selectedId = params.get("case") || null;
  return result;
}
export default function useCaseWorkspace(domain, token, account) {
  const base =
    domain === "tickets" ? "/api/support/tickets" : "/api/orders/disputes";
  const [state, setState] = useState(() => parseState(domain, account));
  const [query, setQuery] = useState(state.search);
  const [queue, setQueue] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const alive = useRef(true);
  const replyTimer = useRef(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const selected = useRef(state.selectedId);
  selected.current = state.selectedId;
  const stateRef = useRef(state);
  stateRef.current = state;
  const update = useCallback(
    (patch, replace = false) => {
      const next = { ...stateRef.current, ...patch };
      stateRef.current = next;
      snapshots.set(account + ":" + domain, next);
      if (typeof window !== "undefined") {
        writeLocation(domain, next, replace);
      }
      setState(next);
    },
    [account, domain],
  );
  useEffect(() => {
    update({}, true);
  }, [update]);
  useEffect(() => {
    const listener = () => setState(parseState(domain, account));
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, [domain, account]);
  useEffect(() => {
    const timer = setTimeout(
      () => setQuery(state.search.trim()),
      config.timing.searchDebounceMs,
    );
    return () => clearTimeout(timer);
  }, [state.search]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: state.page,
      limit: config.pagination.queue,
      scope: state.scope,
      sort: state.sort,
    });
    if (query) params.set("q", query);
    if (state.status) params.set("status", state.status);
    if (state.priority) params.set("priority", state.priority);
    if (state.work) params.set("work", state.work);
    apiFetch(`${base}/queue?${params}`, { token })
      .then((data) => {
        if (active) {
          setQueue(data);
          if (state.page > data.totalPages)
            update({ page: data.totalPages }, true);
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    base,
    token,
    state.page,
    state.scope,
    state.status,
    state.priority,
    state.work,
    state.sort,
    query,
    revision,
    update,
  ]);
  const loadDetail = useCallback(
    async (id, preserveCommitted = false, silent = false) => {
      const request = ++generation.current;
      if (!id) {
        setDetail(null);
        setDetailLoading(false);
        return;
      }
      if (!silent) setDetailLoading(true);
      setDetailError("");
      setRefreshError("");
      try {
        const data = await apiFetch(`${base}/${encodeURIComponent(id)}`, {
          token,
        });
        if (request === generation.current && selected.current === id)
          setDetail(data);
      } catch (err) {
        if (request === generation.current && selected.current === id) {
          if (preserveCommitted && ![403, 404].includes(err.status)) {
            setDetail((old) => ({ ...old, capabilities: undefined }));
            setRefreshError(
              "บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณาลองใหม่",
            );
          } else {
            setDetail(null);
            setDetailError(
              err.status === 403
                ? "คุณไม่มีสิทธิ์เปิดรายละเอียดเคสนี้"
                : err.message,
            );
          }
        }
      } finally {
        if (request === generation.current) setDetailLoading(false);
      }
    },
    [base, token],
  );
  useEffect(() => {
    setDetail(null);
    setLoadingNotes(false);
    setNotesError("");
    loadDetail(state.selectedId);
    return () => {
      generation.current++;
      clearTimeout(replyTimer.current);
    };
  }, [state.selectedId, loadDetail]);
  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
    if (selected.current) loadDetail(selected.current);
  }, [loadDetail]);
  const refreshAfterReply = useCallback(() => {
    const id = selected.current;
    setRevision((value) => value + 1);
    clearTimeout(replyTimer.current);
    // Chat delivers ticket SLA metadata asynchronously. Reconcile without
    // unmounting the transcript/composer while the agent continues working.
    replyTimer.current = setTimeout(() => {
      if (alive.current && selected.current === id) loadDetail(id, true, true);
    }, config.timing.messageRefreshMs);
  }, [loadDetail]);
  async function loadOlderNotes() {
    if (!detail?.messagesNextCursor || loadingNotes) return;
    const id = detail.id,
      request = generation.current;
    setLoadingNotes(true);
    setNotesError("");
    try {
      const params = new URLSearchParams({
        before: detail.messagesNextCursor,
        limit: config.pagination.messages,
      });
      const page = await apiFetch(
        `${base}/${encodeURIComponent(id)}?${params}`,
        { token },
      );
      if (selected.current !== id || generation.current !== request) return;
      setDetail((old) => ({
        ...old,
        messages: [
          ...new Map(
            [...(old.messages || []), ...(page.messages || [])].map(
              (message) => [message.id, message],
            ),
          ).values(),
        ],
        messagesNextCursor: page.messagesNextCursor,
      }));
    } catch (err) {
      if (selected.current === id && generation.current === request)
        setNotesError(err.message);
    } finally {
      if (selected.current === id && generation.current === request)
        setLoadingNotes(false);
    }
  }
  async function mutate(action, body, method = "POST") {
    if (!detail?.id || busy) throw new Error("ยังไม่พร้อมทำรายการ");
    const id = detail.id;
    setBusy(true);
    try {
      const result = await apiFetch(
        `${base}/${encodeURIComponent(id)}/${action}`,
        { method, token, body },
      );
      if (alive.current) setRevision((v) => v + 1);
      if (alive.current && selected.current === id) {
        // Mutation is already committed: refresh failures are not mutation failures.
        setDetail((old) => ({ ...old, ...(result?.id === id ? result : {}) }));
        await loadDetail(id, true);
      }
      return result;
    } catch (err) {
      if (alive.current && err.status === 409) {
        setRevision((v) => v + 1);
        if (selected.current === id) await loadDetail(id);
      }
      throw err;
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return {
    state,
    update,
    queue,
    loading,
    error,
    detail,
    detailLoading,
    detailError,
    refreshError,
    loadOlderNotes,
    loadingNotes,
    notesError,
    busy,
    mutate,
    refresh,
    refreshAfterReply,
    retryDetail: () => loadDetail(state.selectedId),
  };
}
