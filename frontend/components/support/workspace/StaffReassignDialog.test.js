import { act, fireEvent, render, screen } from "@testing-library/react";
import StaffReassignDialog from "./StaffReassignDialog";
import { apiFetch } from "../../../lib/api";
jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
test("staff selection uses eligible directory and retains reason when reassign fails", async () => {
  apiFetch.mockResolvedValue({
    items: [
      {
        id: "staff",
        displayName: "เจ้าหน้าที่ทดสอบ",
        roles: ["CUSTOMER_SERVICE"],
      },
    ],
    totalPages: 1,
  });
  const onClose = jest.fn();
  render(
    <StaffReassignDialog
      dispute={{ id: "d" }}
      token="token"
      onClose={onClose}
      onSubmit={() => Promise.reject(new Error("version conflict"))}
    />,
  );
  fireEvent.click(
    await screen.findByRole("radio", { name: /เจ้าหน้าที่ทดสอบ/ }),
  );
  fireEvent.change(screen.getByLabelText("เหตุผลในการส่งมอบ"), {
    target: { value: "handoff reason" },
  });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันมอบหมาย" })),
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText("เหตุผลในการส่งมอบ")).toHaveValue(
    "handoff reason",
  );
  expect(screen.getByText("version conflict")).toBeInTheDocument();
  expect(apiFetch.mock.calls[0][0]).toMatch(
    "/api/orders/disputes/d/eligible-staff?",
  );
});
