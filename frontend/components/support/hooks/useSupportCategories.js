"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

export default function useSupportCategories(kind, token) {
  const [state, setState] = useState({ items: [], loading: true, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ items: [], loading: true, error: "" });
    apiFetch(
      `/api/support/${kind === "help" ? "help" : "tickets"}/categories`,
      { token, signal: controller.signal },
    )
      .then((data) => {
        if (!Array.isArray(data.items))
          throw new Error("Invalid category response");
        if (!controller.signal.aborted)
          setState({ items: data.items, loading: false, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ items: [], loading: false, error: error.message });
      });
    return () => controller.abort();
  }, [kind, token]);
  return state;
}
