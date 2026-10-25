import { act, render, screen, waitFor } from "@testing-library/react";
import TicketThreadPage from "./page";
import { apiFetch } from "../../../../lib/api";

const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter, useParams: () => ({ id: "ticket-1" }) }));
jest.mock("../../../../components/NavBar", () => () => null);
jest.mock("../../../../components/Footer", () => () => null);
jest.mock("../../../../components/support/EmbeddedChat", () => () => null);
jest.mock("../../../../components/support/hooks/useCustomerServiceConfig", () => () =>
  require("../../../../../backend/shared/config/customer-service-client.json"));
jest.mock("../../../../lib/auth", () => ({
  getAccessToken: () => "token", getStoredUser: () => ({ id: "buyer", role: "BUYER" }),
}));
jest.mock("../../../../lib/api", () => ({ apiFetch: jest.fn() }));

let status;
beforeEach(() => {
  jest.clearAllMocks();
  status = "RESOLVED";
  apiFetch.mockImplementation(async (url) => url.endsWith("/csat") ? {
    eligible: false, complete: status === "RESOLVED", response: { rating: 4, comment: "ช่วยเหลือดี" },
  } : {
    id: "ticket-1", requesterId: "buyer", subject: "คำร้องทดสอบ", status,
    createdAt: "2026-10-01T00:00:00Z", messages: [], ticketNumber: "T-1",
  });
});

test("saved CSAT remains visible after polling changes RESOLVED to IN_PROGRESS", async () => {
  jest.useFakeTimers();
  try {
    render(<TicketThreadPage />);
    await screen.findByText("ขอบคุณสำหรับคะแนน 4/5 ดาว");
    status = "IN_PROGRESS";
    const config = require("../../../../../backend/shared/config/customer-service-client.json");
    await act(async () => { jest.advanceTimersByTime(config.timing.dashboardRefreshMs); });
    await screen.findByText("กำลังดำเนินการ");
    expect(await screen.findByText("ขอบคุณสำหรับคะแนน 4/5 ดาว")).toBeInTheDocument();
    expect(screen.getByText("ช่วยเหลือดี")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  } finally { jest.useRealTimers(); }
});

test("directly reopening an in-progress ticket restores the saved score", async () => {
  status = "IN_PROGRESS";
  render(<TicketThreadPage />);
  expect(await screen.findByText("ขอบคุณสำหรับคะแนน 4/5 ดาว")).toBeInTheDocument();
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/support/tickets/ticket-1/csat", expect.any(Object)));
});
