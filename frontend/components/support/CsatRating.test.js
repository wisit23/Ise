import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CsatRating from "./CsatRating";
import { apiFetch } from "../../lib/api";
jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../lib/auth", () => ({ getAccessToken: () => "token" }));
jest.mock("./hooks/useCustomerServiceConfig", () => () =>
  require("../../../backend/shared/config/customer-service-client.json"),
);
beforeEach(() => jest.clearAllMocks());

test("requires stars, submits feedback, and restores the saved rating", async () => {
  apiFetch.mockResolvedValueOnce({ eligible: true, response: null });
  render(<CsatRating endpoint="/case/csat" />);
  const button = await screen.findByRole("button", {
    name: "ส่งคะแนนความพึงพอใจ",
  });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "4 ดาว · พอใจ" }));
  fireEvent.change(screen.getByLabelText("ความคิดเห็นเพิ่มเติม (ไม่บังคับ)"), {
    target: { value: "ช่วยเหลือดี" },
  });
  apiFetch.mockResolvedValueOnce({
    eligible: false,
    response: { rating: 4, comment: "ช่วยเหลือดี" },
  });
  fireEvent.click(button);
  await screen.findByText("ขอบคุณสำหรับคะแนน 4/5 ดาว");
  expect(apiFetch).toHaveBeenLastCalledWith("/case/csat", {
    method: "POST",
    token: "token",
    body: { rating: 4, comment: "ช่วยเหลือดี" },
    timeoutMs: expect.any(Number),
  });
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});

test("submission failure preserves stars and feedback for retry", async () => {
  apiFetch.mockResolvedValueOnce({ eligible: true, response: null });
  render(<CsatRating endpoint="/case/csat" />);
  await screen.findByRole("radio", { name: "5 ดาว · พอใจมาก" });
  fireEvent.click(screen.getByRole("radio", { name: "5 ดาว · พอใจมาก" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "feedback" },
  });
  apiFetch.mockRejectedValueOnce(new Error("เครือข่ายขัดข้อง"));
  fireEvent.click(screen.getByRole("button", { name: "ส่งคะแนนความพึงพอใจ" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("textbox")).toHaveValue("feedback");
  expect(screen.getByRole("radio", { name: "5 ดาว · พอใจมาก" })).toBeChecked();
});

test("load failure can be retried and an existing rating stays read only", async () => {
  apiFetch.mockRejectedValueOnce(new Error("offline"));
  render(<CsatRating endpoint="/case/csat" />);
  await screen.findByRole("alert");
  apiFetch.mockResolvedValueOnce({
    eligible: false,
    response: { rating: 3, comment: "saved" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "ลองโหลดแบบประเมินอีกครั้ง" }),
  );
  await screen.findByText("ขอบคุณสำหรับคะแนน 3/5 ดาว");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

test("an open case never offers rating controls", async () => {
  apiFetch.mockResolvedValueOnce({
    eligible: false,
    complete: false,
    response: null,
  });
  render(<CsatRating endpoint="/case/csat" />);
  await waitFor(() =>
    expect(
      screen.getByText("แบบประเมินจะเปิดเมื่อเรื่องได้รับการแก้ไขหรือปิดแล้ว"),
    ).toBeInTheDocument(),
  );
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});
