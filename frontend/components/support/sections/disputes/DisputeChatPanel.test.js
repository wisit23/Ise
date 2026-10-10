import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { apiFetch, fetchAuthedBlobUrl } from "../../../../lib/api";
import DisputeChatPanel from "./DisputeChatPanel";

jest.mock("../../../../lib/api", () => ({
  apiFetch: jest.fn(),
  fetchAuthedBlobUrl: jest.fn(),
}));

const dispute = { id: "dispute-10" };

beforeEach(() => {
  jest.clearAllMocks();
  window.open = jest.fn();
});

it("loads the authorized buyer-seller transcript and opens attachments through the proxy", async () => {
  apiFetch.mockResolvedValue({
    available: true,
    items: [
      {
        id: "message-seller",
        senderRole: "SELLER",
        type: "FILE",
        body: "ใบส่งของ",
        payload: { filename: "shipping.pdf" },
        createdAt: "2026-10-10T02:00:00.000Z",
      },
      {
        id: "message-buyer",
        senderRole: "BUYER",
        type: "TEXT",
        body: "ยังไม่ได้รับสินค้า",
        createdAt: "2026-10-10T01:00:00.000Z",
      },
    ],
    nextCursor: null,
  });
  fetchAuthedBlobUrl.mockResolvedValue("blob:authorized-chat-file");

  render(
    <DisputeChatPanel
      dispute={dispute}
      token="safety-token"
      closing={false}
      onClose={jest.fn()}
    />,
  );

  expect(await screen.findByText("ยังไม่ได้รับสินค้า")).toBeInTheDocument();
  expect(screen.getByText("ผู้ซื้อ")).toBeInTheDocument();
  expect(screen.getByText("ผู้ขาย")).toBeInTheDocument();
  expect(apiFetch).toHaveBeenCalledWith(
    "/api/orders/disputes/dispute-10/chat-history?limit=30",
    { token: "safety-token" },
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "เปิดไฟล์แนบแบบตรวจสิทธิ์ · shipping.pdf",
    }),
  );
  await waitFor(() =>
    expect(fetchAuthedBlobUrl).toHaveBeenCalledWith(
      "/api/orders/disputes/dispute-10/chat-attachments/message-seller",
      "safety-token",
    ),
  );
  expect(window.open).toHaveBeenCalledWith(
    "blob:authorized-chat-file",
    "_blank",
    "noreferrer",
  );
});

it("distinguishes an unavailable ORDER conversation from an empty transcript", async () => {
  apiFetch.mockResolvedValue({
    available: false,
    reason: "ยังไม่มีบทสนทนาสำหรับคำสั่งซื้อนี้",
  });

  render(
    <DisputeChatPanel
      dispute={dispute}
      token="safety-token"
      closing={false}
      onClose={jest.fn()}
    />,
  );

  expect(
    await screen.findByText("ยังไม่มีบทสนทนาสำหรับคำสั่งซื้อนี้"),
  ).toBeInTheDocument();
  expect(screen.getByText("ยังไม่มี ORDER conversation")).toBeInTheDocument();
});
