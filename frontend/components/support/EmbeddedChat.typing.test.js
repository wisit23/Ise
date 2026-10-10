import { act, render, screen } from "@testing-library/react";
import EmbeddedChat from "./EmbeddedChat";
const mockHandlers = {};
const mockSocket = { emit: jest.fn((event, room, ack) => ack?.({ ok: true })) };
jest.mock("../chat/ChatSocketProvider", () => ({
  useChatSocket: () => ({ socket: mockSocket, connected: true }),
  useChatSocketEvent: (event, handler) => { mockHandlers[event] = handler; },
}));
jest.mock("../../lib/auth", () => ({ getStoredUser: () => ({ id: "cs" }), getAccessToken: () => "token" }));
jest.mock("../../lib/chat", () => ({ listMessages: () => Promise.resolve({ items: [], nextCursor: null }), markRead: () => Promise.resolve() }));
jest.mock("../chat/MessageList", () => function MockMessages() { return <div data-testid="messages" />; });
jest.mock("../chat/MessageComposer", () => function MockComposer() { return <div data-testid="composer" />; });

test("typing appears inside the message area and clears on stop or room change", async () => {
  const { rerender } = render(<EmbeddedChat conversationId="room" recipientId="buyer" otherName="ลูกค้า" />);
  await screen.findByTestId("messages");
  act(() => mockHandlers.typing({ conversationId: "other", userId: "buyer", typing: true }));
  expect(screen.queryByRole("status", { name: "ลูกค้า กำลังพิมพ์" })).toBeNull();
  act(() => mockHandlers.typing({ conversationId: "room", userId: "buyer", typing: true }));
  const indicator = screen.getByRole("status", { name: "ลูกค้า กำลังพิมพ์" });
  expect(screen.getByTestId("messages").parentElement).toContainElement(indicator);
  expect(screen.getByTestId("composer").parentElement).not.toContainElement(indicator);
  act(() => mockHandlers.typing({ conversationId: "room", userId: "buyer", typing: false }));
  expect(screen.queryByRole("status", { name: "ลูกค้า กำลังพิมพ์" })).toBeNull();
  act(() => mockHandlers.typing({ conversationId: "room", userId: "buyer", typing: true }));
  await act(async () => { rerender(<EmbeddedChat conversationId="room2" recipientId="seller" />); });
  expect(screen.queryByRole("status", { name: "ลูกค้า กำลังพิมพ์" })).toBeNull();
});
