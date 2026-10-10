"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import defaults from "../../../lib/customerServiceConfig";
import { validateClientConfig } from "../../../../backend/shared/config/validate-client";

export default function useCustomerServiceConfig() {
  const [config, setConfig] = useState(defaults);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/api/support/help/config", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setConfig(validateClientConfig(data));
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          console.error(
            "Customer service configuration unavailable",
            error.message,
          );
      });
    return () => controller.abort();
  }, []);
  return config;
}
