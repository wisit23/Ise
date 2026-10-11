"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { parseComplaintResponse } from "./executiveComplaints";
function integerConfig(name, raw, fallback, min, max) {
  const text = raw ?? String(fallback);
  const value = Number(text);
  if (
    !/^\d+$/.test(text) ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}
const SEARCH_DEBOUNCE_MS = integerConfig(
  "NEXT_PUBLIC_REPORT_SEARCH_DEBOUNCE_MS",
  process.env.NEXT_PUBLIC_REPORT_SEARCH_DEBOUNCE_MS,
  300,
  0,
  2000,
);
const REQUEST_TIMEOUT_MS = integerConfig(
  "NEXT_PUBLIC_REPORT_REQUEST_TIMEOUT_MS",
  process.env.NEXT_PUBLIC_REPORT_REQUEST_TIMEOUT_MS,
  10000,
  1000,
  60000,
);

export default function useExecutiveComplaints(token) {
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectedReport, setSelectedReport] = useState(
    /** @type {import('./executiveComplaints').ExecutiveReport|null} */ (null),
  );
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(
    /** @type {import('./executiveComplaints').ExecutiveComplaintData|null} */ (
      null
    ),
  );
  const [reloadVersion, setReloadVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const value = searchInput.trim();
    if (isComposing || value === search) return;
    const timer = setTimeout(() => {
      setSearch(value);
      setPage(1);
      setSelectedTargetId("");
      setSelectedTarget(null);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, search, isComposing]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSelectedReport(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (sortBy) params.set("sortBy", sortBy);
    if (selectedTargetId) params.set("targetId", selectedTargetId);
    if (search) params.set("search", search);
    params.set("page", String(page));

    const timeout = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      setError("ระบบใช้เวลาตอบกลับนานเกินไป กรุณาลองใหม่");
      setLoading(false);
    }, REQUEST_TIMEOUT_MS);

    apiFetch(`/api/auth/executive/reports?${params}`, { token })
      .then(parseComplaintResponse)
      .then((result) => {
        if (cancelled) return;
        // A report may disappear from the selected status while viewing a
        // later page. Return to the last existing page instead of leaving an
        // empty list with no usable pagination controls.
        const lastPage = Math.max(result.totalPages ?? page, 1);
        if (page > lastPage) {
          setPage(lastPage);
        } else {
          setData(result);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "โหลดข้อมูลข้อร้องเรียนไม่สำเร็จ",
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [status, sortBy, selectedTargetId, search, page, token, reloadVersion]);

  const highRiskTargets = data?.anomalySummary?.highRiskTargets || [];

  const selectedTargetShopName =
    selectedTarget?.shopName ||
    data?.items.find((r) => r.targetId === selectedTargetId)?.targetShopName ||
    highRiskTargets.find((t) => t.targetId === selectedTargetId)
      ?.targetShopName;

  const selectedTargetOwnerName =
    selectedTarget?.name ||
    data?.items.find((r) => r.targetId === selectedTargetId)?.targetName ||
    highRiskTargets.find((t) => t.targetId === selectedTargetId)?.targetName;

  const handleSelectTarget = (targetId, shopName, name, forceSort = false) => {
    setPage(1);
    setSelectedTargetId(targetId);
    setSelectedTarget({ id: targetId, shopName, name });
    if (forceSort) setSortBy("most_reported");
  };

  const handleClearTarget = () => {
    setPage(1);
    setSelectedTargetId("");
    setSelectedTarget(null);
  };

  function handleSearch(event) {
    event.preventDefault();
    if (isComposing) return;
    setPage(1);
    setSelectedTargetId("");
    setSelectedTarget(null);
    setSearch(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  return {
    status,
    setStatus,
    sortBy,
    setSortBy,
    selectedTargetId,
    selectedReport,
    setSelectedReport,
    searchInput,
    setSearchInput,
    search,
    setIsComposing,
    page,
    setPage,
    data,
    loading,
    error,
    selectedTargetShopName,
    selectedTargetOwnerName,
    highRiskTargets,
    handleSelectTarget,
    handleClearTarget,
    handleSearch,
    clearSearch,
    retry: () => setReloadVersion((value) => value + 1),
  };
}
