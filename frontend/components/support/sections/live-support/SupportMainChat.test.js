import { render, screen, waitFor } from "@testing-library/react";
import SupportMainChat from "./SupportMainChat";
import { markRead } from "../../../../lib/chat";

const mockSocket = {
  emit: jest.fn((event, _payload, ack) => {
    if (event === "join") ack({ ok: true, onlineUsers: { buyer: true } });
  }),
};

jest.mock("../../../chat/ChatSocketProvider", () => ({
  useChatSocket: () => ({ socket: mockSocket, connected: true }),
  useChatSocketEvent: () => {},
}));
jest.mock("../../../chat/MessageList", () => () => null);
jest.mock("../../../chat/MessageComposer", () => () => null);
jest.mock("../../../../lib/chat", () => ({
  listMessages: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
  markRead: jest.fn().mockResolvedValue(undefined),
  sendMessage: jest.fn(),
}));
jest.mock("../../../../lib/auth", () => ({
  getAccessToken: () => "token",
  getStoredUser: () => ({ id: "cs" }),
}));

it("accepts the server's onlineUsers map when opening a ticket chat", async () => {
  render(
    <SupportMainChat
      ticket={{
        id: "ticket", ticketNumber: "CS-1", subject: "Ticket",
        requesterId: "buyer", assigneeId: "cs", conversationId: "room",
        status: "IN_PROGRESS",
      }}
      onToggleDetails={() => {}}
      onBackToQueue={() => {}}
    />,
  );
  expect(mockSocket.emit).toHaveBeenCalledWith("join", "room", expect.any(Function));
  await waitFor(() => expect(screen.getByText(/ผู้แจ้ง #buyer · ออนไลน์/)).toBeInTheDocument());
  await waitFor(() => expect(markRead).toHaveBeenCalledWith("room", "token"));
});
