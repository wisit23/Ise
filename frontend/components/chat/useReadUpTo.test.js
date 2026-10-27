import { act, renderHook, waitFor } from "@testing-library/react";
import useReadUpTo from "./useReadUpTo";
import { getConversation } from "../../lib/chat";

jest.mock("../../lib/chat", () => ({ getConversation: jest.fn() }));
jest.mock("../../lib/auth", () => ({ getAccessToken: () => "token" }));

const socketHandlers = {};
jest.mock("./ChatSocketProvider", () => ({
  useChatSocketEvent: (event, handler) => {
    socketHandlers[event] = handler;
  },
}));

const participants = [
  { userId: "me", lastReadAt: "2026-10-28T06:00:00.000Z" },
  { userId: "seller", lastReadAt: "2026-10-28T04:30:00.000Z" },
  { userId: "agent", lastReadAt: "2026-10-28T04:40:00.000Z" },
  { userId: "left", lastReadAt: "2026-10-28T09:00:00.000Z", leftAt: "2026-10-28T09:01:00.000Z" },
];

describe("useReadUpTo", () => {
  beforeEach(() => jest.clearAllMocks());

  it("takes the latest read time among the other active participants", () => {
    const { result } = renderHook(() => useReadUpTo("c-1", "me", participants));
    // Not "me" (own reads don't count) and not someone who left the chat.
    expect(result.current).toBe("2026-10-28T04:40:00.000Z");
    expect(getConversation).not.toHaveBeenCalled();
  });

  it("fetches participants itself when the caller has none to give", async () => {
    getConversation.mockResolvedValue({ participants });
    const { result } = renderHook(() => useReadUpTo("c-1", "me"));
    await waitFor(() => expect(result.current).toBe("2026-10-28T04:40:00.000Z"));
    expect(getConversation).toHaveBeenCalledWith("c-1", "token");
  });

  it("waits while the caller's participants are still loading", () => {
    const { result } = renderHook(() => useReadUpTo("c-1", "me", null));
    expect(result.current).toBeNull();
    expect(getConversation).not.toHaveBeenCalled();
  });

  it("moves forward on a live read event for this conversation only", () => {
    const { result } = renderHook(() => useReadUpTo("c-1", "me", participants));

    act(() =>
      socketHandlers["conversation:read"]({
        conversationId: "other-chat",
        userId: "seller",
        lastReadAt: "2026-10-28T08:00:00.000Z",
      }),
    );
    expect(result.current).toBe("2026-10-28T04:40:00.000Z");

    act(() =>
      socketHandlers["conversation:read"]({
        conversationId: "c-1",
        userId: "seller",
        lastReadAt: "2026-10-28T05:00:00.000Z",
      }),
    );
    expect(result.current).toBe("2026-10-28T05:00:00.000Z");
  });

  it("never moves backwards when an older participants list arrives", () => {
    const { result, rerender } = renderHook(
      ({ list }) => useReadUpTo("c-1", "me", list),
      { initialProps: { list: participants } },
    );
    rerender({
      list: [{ userId: "seller", lastReadAt: "2026-10-28T04:00:00.000Z" }],
    });
    expect(result.current).toBe("2026-10-28T04:40:00.000Z");
  });
});
