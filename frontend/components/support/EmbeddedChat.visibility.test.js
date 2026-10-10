import { render, screen } from "@testing-library/react";
import EmbeddedChat from "./EmbeddedChat";
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
  listMessages: () =>
    Promise.resolve({
      items: [
        { id: "1", body: "private staff note", visibility: "INTERNAL" },
        { id: "2", body: "public reply", visibility: "ALL" },
      ],
      nextCursor: null,
    }),
  markRead: () => Promise.resolve(),
}));
test("workspace transcript excludes internal notes while staff context can show them separately", async () => {
  render(<EmbeddedChat conversationId="room" hideInternal />);
  await screen.findByText("public reply");
  expect(screen.queryByText("private staff note")).not.toBeInTheDocument();
});
