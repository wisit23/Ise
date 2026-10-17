"use client";

import { useEffect, useRef, useState } from "react";
import { defaultCustomDay } from "./executive";
import {
  EMPTY_FILTERS,
  INBOX_PAGE_SIZE,
  fetchInbox,
  inboxRange,
  inboxRangeError,
} from "./executiveInbox";

/**
 * State of the Executive complaints page: what to look at, over which period,
 * with which filters, and the cases that come back. A custom range that is
 * half typed or not allowed never refetches or blanks the list; the page keeps
 * showing the last range that was good, as the overview does for its day.
 */
export default function useExecutiveInbox(token) {
  const [source, setSource] = useState("all");
  const [period, setPeriod] = useState("today");
  const [draft, setDraft] = useState(() => ({
    from: defaultCustomDay(),
    to: defaultCustomDay(),
  }));
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  // The choices each kind's filters offer come with its answers; keep the last
  // ones so a dropdown does not empty while the next answer loads.
  const [options, setOptions] = useState({});
  const [attempt, setAttempt] = useState(0);

  const draftError = period === "custom" ? inboxRangeError(draft) : "";
  const lastValid = useRef(draft);
  if (period === "custom" && !draftError) lastValid.current = draft;
  const range = inboxRange(period, lastValid.current);

  // "All" is read once and paged here; one kind is paged by its service.
  const serverPage = source === "all" ? 1 : page;
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchInbox({
      source,
      range: { from: range.from, to: range.to },
      filters: JSON.parse(filterKey),
      page: serverPage,
      token,
    })
      .then((answer) => {
        if (cancelled) return;
        setResult(answer);
        setOptions((previous) => {
          const next = { ...previous };
          for (const [kind, one] of Object.entries(answer.results)) {
            if (Object.keys(one.options).length > 0) next[kind] = one.options;
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, source, range.from, range.to, filterKey, serverPage, attempt]);

  const changeSource = (next) => {
    setSource(next);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };
  const changePeriod = (next) => {
    setPeriod(next);
    setPage(1);
  };
  const changeDraft = (next) => {
    setDraft(next);
    setPage(1);
  };
  const changeFilter = (name, value) => {
    setFilters((previous) => ({ ...previous, [name]: value }));
    setPage(1);
  };

  const items = !result
    ? []
    : source === "all"
      ? result.items.slice((page - 1) * INBOX_PAGE_SIZE, page * INBOX_PAGE_SIZE)
      : result.items;

  return {
    source,
    changeSource,
    period,
    changePeriod,
    draft,
    changeDraft,
    draftError,
    filters,
    changeFilter,
    page,
    setPage,
    result,
    items,
    options,
    loading,
    retry: () => setAttempt((n) => n + 1),
  };
}
