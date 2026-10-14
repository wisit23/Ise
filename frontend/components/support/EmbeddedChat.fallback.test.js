import { render, screen, act } from "@testing-library/react";
import EmbeddedChat from "./EmbeddedChat";
import { listMessages } from "../../lib/chat";

jest.mock("../chat/ChatSocketProvider", () => ({
  useChatSocket: () => ({ socket: null, connected: false }),
  useChatSocketEvent: () => {},
}));
jest.mock(
  "../chat/MessageList",
  () =>
    function MockMessages({ messages }) {
      return (
        <div>
          {messages.map((message) => (
            <p key={message.id}>{message.body}</p>
          ))}
        </div>
      );
    },
);
jest.mock(
  "../chat/MessageComposer",
  () =>
    function MockComposer() {
      return null;
    },
);
jest.mock("../../lib/auth", () => ({
  getStoredUser: () => ({ id: "cs" }),
  getAccessToken: () => "token",
}));
jest.mock("../../lib/chat", () => ({
  listMessages: jest.fn(),
  markRead: () => Promise.resolve(),
}));

const first = {
  id: "1",
  body: "ข้อความแรก",
  visibility: "ALL",
  createdAt: "2026-10-14T10:00:00.000Z",
};
const reply = {
  id: "2",
  body: "ตอบกลับจากอีกฝั่ง",
  visibility: "ALL",
  createdAt: "2026-10-14T10:00:05.000Z",
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("shows the other side's new message without a refresh while the socket is down", async () => {
  listMessages.mockResolvedValue({ items: [first], nextCursor: null });
  render(<EmbeddedChat conversationId="room" />);
  await act(async () => {});
  expect(screen.getByText("ข้อความแรก")).toBeInTheDocument();

  // Newest-first, like the real endpoint.
  listMessages.mockResolvedValue({ items: [reply, first], nextCursor: null });
  await act(async () => {
    jest.advanceTimersByTime(4000);
  });

  expect(screen.getByText("ตอบกลับจากอีกฝั่ง")).toBeInTheDocument();
  expect(screen.getAllByText("ข้อความแรก")).toHaveLength(1);
});
