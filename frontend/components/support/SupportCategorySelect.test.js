import { render, screen } from "@testing-library/react";
import SupportCategorySelect from "./SupportCategorySelect";
import { apiFetch } from "../../lib/api";
jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock(
  "../ui/Select",
  () =>
    function TestSelect({ options, value, disabled, error }) {
      return (
        <>
          <select
            aria-label="หมวดหมู่"
            value={value}
            disabled={disabled}
            onChange={() => {}}
          >
            <option value="">เลือกหมวดหมู่</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {error && <p role="alert">{error}</p>}
        </>
      );
    },
);

test("new active database categories appear without a frontend release", async () => {
  apiFetch.mockResolvedValue({
    items: [{ value: "SHIPPING", label: "การจัดส่ง" }],
  });
  render(
    <SupportCategorySelect
      token="customer"
      value="ORDER"
      onChange={jest.fn()}
    />,
  );
  await screen.findByRole("option", { name: "การจัดส่ง" });
  expect(
    screen.queryByRole("option", { name: "คำสั่งซื้อ" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("หมวดหมู่")).toHaveValue("");
});
