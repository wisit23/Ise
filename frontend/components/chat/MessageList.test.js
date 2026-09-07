import { render, screen, fireEvent } from "@testing-library/react";
import MessageList from "./MessageList";

describe("MessageList", () => {
  it("renders empty state and responds to quick prompt click", () => {
    const onPromptClick = jest.fn();
    render(
      <MessageList
        messages={[]}
        currentUserId="user-1"
        onPromptClick={onPromptClick}
      />,
    );

    expect(
      screen.getByText("ยังไม่มีข้อความ เริ่มทักได้เลย"),
    ).toBeInTheDocument();
    const promptButton = screen.getByText("สินค้ายังอยู่ไหมครับ?");
    fireEvent.click(promptButton);
    expect(onPromptClick).toHaveBeenCalledWith("สินค้ายังอยู่ไหมครับ?");
  });

  it("marks historical messages with none and animates the latest message on initial load", () => {
    const messages = [
      {
        id: "msg-1",
        senderId: "user-2",
        type: "TEXT",
        body: "สวัสดีครับ",
        createdAt: "2026-09-04T10:00:00.000Z",
      },
      {
        id: "msg-2",
        senderId: "user-1",
        type: "TEXT",
        body: "สวัสดี มีสินค้าครับ",
        createdAt: "2026-09-04T10:01:00.000Z",
      },
    ];

    render(
      <MessageList
        messages={messages}
        currentUserId="user-1"
        activeRoomId="room-1"
      />,
    );

    const bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].getAttribute("data-animate")).toBe("none");
    expect(bubbles[0].className).not.toContain("animate-message-pop");
    expect(bubbles[1].getAttribute("data-animate")).toBe("pop");
    expect(bubbles[1].className).toContain("animate-message-pop");
  });

  it("animates new incoming message with expanding pop animation anchored at bottom-left", () => {
    const initialMessages = [
      {
        id: "msg-1",
        senderId: "user-1",
        type: "TEXT",
        body: "ข้อความแรก",
        createdAt: "2026-09-04T10:00:00.000Z",
      },
      {
        id: "msg-2",
        senderId: "user-1",
        type: "TEXT",
        body: "ข้อความสอง",
        createdAt: "2026-09-04T10:01:00.000Z",
      },
    ];

    const { rerender } = render(
      <MessageList
        messages={initialMessages}
        currentUserId="user-1"
        activeRoomId="room-1"
      />,
    );

    // Initial historical message has no pop
    let bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles[0].getAttribute("data-animate")).toBe("none");

    // New incoming message from other user arrives
    const newIncomingMessage = {
      id: "msg-3",
      senderId: "user-2",
      type: "TEXT",
      body: "สนใจสั่งซื้อ 2 ชิ้นครับ",
      createdAt: "2026-09-04T10:02:00.000Z",
    };

    rerender(
      <MessageList
        messages={[...initialMessages, newIncomingMessage]}
        currentUserId="user-1"
        activeRoomId="room-1"
      />,
    );

    bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles).toHaveLength(3);
    expect(bubbles[0].getAttribute("data-animate")).toBe("none");
    // New incoming message has pop animation and bottom-left origin
    expect(bubbles[2].getAttribute("data-animate")).toBe("pop");
    expect(bubbles[2].className).toContain("animate-message-pop");
    expect(bubbles[2].className).toContain("origin-bottom-left");
  });

  it("animates new outgoing message with expanding pop animation anchored at bottom-right", () => {
    const initialMessages = [
      {
        id: "msg-1",
        senderId: "user-2",
        type: "TEXT",
        body: "สวัสดี",
        createdAt: "2026-09-04T10:00:00.000Z",
      },
    ];

    const { rerender } = render(
      <MessageList
        messages={initialMessages}
        currentUserId="user-1"
        activeRoomId="room-1"
      />,
    );

    // New optimistic outgoing message sent by current user
    const optimisticMessage = {
      id: "optimistic-12345",
      senderId: "user-1",
      type: "TEXT",
      body: "ขอบคุณครับ จัดส่งวันนี้เลย",
      createdAt: "2026-09-04T10:03:00.000Z",
    };

    rerender(
      <MessageList
        messages={[...initialMessages, optimisticMessage]}
        currentUserId="user-1"
        activeRoomId="room-1"
      />,
    );

    const bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles).toHaveLength(2);
    expect(bubbles[1].getAttribute("data-animate")).toBe("pop");
    expect(bubbles[1].className).toContain("animate-message-pop");
    expect(bubbles[1].className).toContain("origin-bottom-right");
  });

  it("does not pop-animate older history messages prepended to the top", () => {
    const initialMessages = [
      {
        id: "msg-2",
        senderId: "user-1",
        type: "TEXT",
        body: "ข้อความปัจจุบัน",
        createdAt: "2026-09-04T10:05:00.000Z",
      },
    ];

    const { rerender } = render(
      <MessageList
        messages={initialMessages}
        currentUserId="user-1"
        activeRoomId="room-1"
      />,
    );

    // Prepended older history message
    const olderMessage = {
      id: "msg-1",
      senderId: "user-2",
      type: "TEXT",
      body: "ข้อความก่อนหน้านี้เมื่อเช้า",
      createdAt: "2026-09-04T08:00:00.000Z",
    };

    rerender(
      <MessageList
        messages={[olderMessage, ...initialMessages]}
        currentUserId="user-1"
        activeRoomId="room-1"
      />,
    );

    const bubbles = screen.getAllByTestId("message-bubble");
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].getAttribute("data-animate")).toBe("none");
    expect(bubbles[0].className).not.toContain("animate-message-pop");
    expect(bubbles[1].getAttribute("data-animate")).toBe("none");
    expect(bubbles[1].className).not.toContain("animate-message-pop");
  });

  it("renders SYSTEM messages correctly", () => {
    const messages = [
      {
        id: "sys-1",
        type: "SYSTEM",
        body: "การสนทนาเริ่มต้นขึ้นแล้ว",
        createdAt: "2026-09-04T09:00:00.000Z",
      },
    ];

    render(
      <MessageList
        messages={messages}
        currentUserId="user-1"
        activeRoomId="room-1"
      />,
    );

    expect(screen.getByText("การสนทนาเริ่มต้นขึ้นแล้ว")).toBeInTheDocument();
  });
});
