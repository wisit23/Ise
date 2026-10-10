import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrderPicker from "./OrderPicker";
import { apiFetch } from "../../lib/api";
jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock(
  "../ui/Select",
  () =>
    function TestSelect({ label, options, value, onChange, disabled }) {
      return (
        <label>
          {label}
          <select
            aria-label={label}
            value={value}
            onChange={onChange}
            disabled={disabled}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    },
);

test("older orders are reachable and switching sides preserves the selected order", async () => {
  apiFetch.mockImplementation((path) => {
    const url = new URL(path, "http://local");
    const id = `${url.pathname.endsWith("selling") ? "seller" : "buyer"}-${url.searchParams.get("page")}`;
    return Promise.resolve({
      items: [{ id, productTitle: id }],
      totalPages: 3,
    });
  });
  const onChange = jest.fn();
  const view = render(
    <OrderPicker token="customer" value="" onChange={onChange} />,
  );
  await screen.findByRole("option", { name: /buyer-1/ });
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await screen.findByRole("option", { name: /buyer-2/ });
  fireEvent.change(
    screen.getByLabelText("เกี่ยวข้องกับคำสั่งซื้อไหน (ถ้ามี)"),
    { target: { value: "buyer-2" } },
  );
  expect(onChange).toHaveBeenCalledWith("buyer-2");
  view.rerender(
    <OrderPicker token="customer" value="buyer-2" onChange={onChange} />,
  );
  fireEvent.change(screen.getByLabelText("ประเภทคำสั่งซื้อ"), {
    target: { value: "selling" },
  });
  await screen.findByRole("option", { name: /seller-1/ });
  expect(
    screen.getByLabelText("เกี่ยวข้องกับคำสั่งซื้อไหน (ถ้ามี)"),
  ).toHaveValue("buyer-2");
  expect(
    apiFetch.mock.calls.some(([path]) => path.includes("selling?page=1")),
  ).toBe(true);
});

test("failed order loads can be retried without being shown as an empty successful response", async () => {
  apiFetch
    .mockReset()
    .mockRejectedValueOnce(new Error("orders unavailable"))
    .mockResolvedValue({ items: [], totalPages: 1 });
  render(<OrderPicker token="customer" value="" onChange={jest.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "orders unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});
