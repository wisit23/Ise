"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import config from "../../lib/customerServiceConfig";
import Select from "../ui/Select";
import Pagination from "../Pagination";
import Button from "../ui/Button";

export default function OrderPicker({ token, value, onChange }) {
  const [side, setSide] = useState("mine");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const [state, setState] = useState({
    items: [],
    totalPages: 1,
    loading: true,
    error: "",
  });
  useEffect(() => {
    const controller = new AbortController();
    setState({ items: [], totalPages: 1, loading: true, error: "" });
    const params = new URLSearchParams({
      page,
      limit: config.pagination.orders,
    });
    apiFetch(`/api/orders/${side}?${params}`, {
      token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!Array.isArray(data.items) || !Number.isInteger(data.totalPages))
          throw new Error("Invalid order response");
        if (!controller.signal.aborted)
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
  }, [side, page, token, revision]);
  const choices =
    selected &&
    value === selected.id &&
    !state.items.some((order) => order.id === value)
      ? [selected, ...state.items]
      : state.items;
  return (
    <div className="space-y-3">
      <Select
        label="ประเภทคำสั่งซื้อ"
        value={side}
        options={[
          { value: "mine", label: "รายการที่ซื้อ" },
          { value: "selling", label: "รายการที่ขาย" },
        ]}
        onChange={(event) => {
          setSide(event.target.value);
          setPage(1);
        }}
      />
      <Select
        label="เกี่ยวข้องกับคำสั่งซื้อไหน (ถ้ามี)"
        value={value}
        disabled={state.loading}
        hint={
          state.loading
            ? "กำลังโหลดคำสั่งซื้อ..."
            : "เปลี่ยนหน้าเพื่อเลือกคำสั่งซื้อเก่าได้"
        }
        options={[
          { value: "", label: "ไม่เกี่ยวข้องกับคำสั่งซื้อ" },
          ...choices.map((order) => ({
            value: order.id,
            label: `${order.productTitle || "คำสั่งซื้อ"} (${order.id.slice(0, 8)})`,
          })),
        ]}
        onChange={(event) => {
          const id = event.target.value;
          setSelected(choices.find((order) => order.id === id) || null);
          onChange(id);
        }}
      />
      {state.error && (
        <div role="alert" className="text-sm text-red-700">
          {state.error}{" "}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            ลองใหม่
          </Button>
        </div>
      )}
      {!state.loading && (
        <Pagination
          page={page}
          totalPages={state.totalPages}
          onChange={setPage}
        />
      )}
    </div>
  );
}
