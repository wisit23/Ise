import { render, screen, fireEvent } from "@testing-library/react";
import MessageList from "./MessageList";

jest.mock("../../lib/api", () => ({
  fetchAuthedBlobUrl: jest.fn(() => new Promise(() => {})),
}));

describe("MessageList", () => {
  it.each(["SELLER", "AGENT", undefined])("does not offer buyer questions to %s", (role) => {
    render(<MessageList messages={[]} currentUserId="seller" currentUserRole={role}
      onPromptClick={jest.fn()} prompts={[{ id: "q", messageText: "คำถามของร้าน" }]} />);
    expect(screen.queryByText("คำถามของร้าน")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("renders empty state and responds to quick prompt click", () => {
    const onPromptClick = jest.fn();
    render(
      <MessageList
        messages={[]}
        currentUserId="user-1"
        currentUserRole="BUYER"
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

  it("renders custom automated questions when provided by seller", () => {
    const onPromptClick = jest.fn();
    const customPrompts = [
      { id: "q-1", messageText: "มีของพร้อมส่งไหมครับ?" },
      { id: "q-2", messageText: "สามารถนัดรับได้ไหมครับ?" },
    ];
    render(
      <MessageList
        messages={[]}
        currentUserId="user-1"
        currentUserRole="BUYER"
        onPromptClick={onPromptClick}
        prompts={customPrompts}
      />,
    );

    expect(screen.getByText("มีของพร้อมส่งไหมครับ?")).toBeInTheDocument();
    expect(screen.getByText("สามารถนัดรับได้ไหมครับ?")).toBeInTheDocument();

    fireEvent.click(screen.getByText("มีของพร้อมส่งไหมครับ?"));
    expect(onPromptClick).toHaveBeenCalledWith("มีของพร้อมส่งไหมครับ?");
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

  it("routes a seller's cancelled auction notification to auction management", () => {
    render(
      <MessageList
        currentUserId="seller-1"
        activeRoomId="auction-room"
        messages={[
          {
            id: "auction-system-1",
            type: "SYSTEM",
            body: "รายการประมูลถูกยกเลิก",
            createdAt: "2026-10-15T09:00:00.000Z",
            payload: {
              event: "auction.item_cancelled",
              role: "SELLER",
              actionUrl: "/auctions/item-1",
              actionLabel: "ดูรายละเอียดรายการ",
            },
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("link", { name: /จัดการสินค้าประมูล/ }),
    ).toHaveAttribute("href", "/seller/auctions");
  });

  it("does not render an external action URL from a message payload", () => {
    render(
      <MessageList
        currentUserId="seller-1"
        activeRoomId="auction-room"
        messages={[
          {
            id: "auction-system-unsafe",
            type: "SYSTEM",
            body: "รายการประมูลถูกยกเลิก",
            createdAt: "2026-10-15T09:00:00.000Z",
            payload: {
              event: "auction.item_cancelled",
              actionUrl: "https://evil.example/auction",
              actionLabel: "ลิงก์ไม่ปลอดภัย",
            },
          },
        ]}
      />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("separates messages from different calendar days", () => {
    render(
      <MessageList
        currentUserId="user-1"
        activeRoomId="room-1"
        messages={[
          {
            id: "day-1",
            senderId: "user-2",
            type: "TEXT",
            body: "วันแรก",
            createdAt: "2026-09-03T10:00:00.000Z",
          },
          {
            id: "day-2",
            senderId: "user-1",
            type: "TEXT",
            body: "วันถัดมา",
            createdAt: "2026-09-04T10:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });

  describe("photo bubbles", () => {
    const photo = (body) => ({
      id: "m-photo",
      conversationId: "c-1",
      senderId: "user-1",
      type: "IMAGE",
      body,
      payload: { filename: "shot.png", mimeType: "image/png", size: 1024 },
      createdAt: "2026-10-28T04:33:00.000Z",
    });

    it("frames a bare photo thinly and puts the time on top of it", () => {
      render(<MessageList messages={[photo("")]} currentUserId="user-1" />);
      const bubble = screen.getByTestId("message-bubble");

      expect(bubble).not.toHaveClass("px-4");
      expect(bubble).toHaveClass("p-1");
      expect(bubble.querySelector(".absolute.rounded-full")).toHaveTextContent(
        /\d{2}:\d{2}/,
      );
    });

    it("pads a photo's caption below the image", () => {
      render(
        <MessageList messages={[photo("ดูรอยตรงนี้")]} currentUserId="user-1" />,
      );

      expect(screen.getByText("ดูรอยตรงนี้").parentElement).toHaveClass("px-3");
      expect(
        screen.getByTestId("message-bubble").querySelector(".absolute.rounded-full"),
      ).toBeNull();
    });
  });

  describe("read ticks on own messages", () => {
    const sent = (id, createdAt) => ({
      id,
      conversationId: "c-1",
      senderId: "me",
      type: "TEXT",
      body: `msg ${id}`,
      createdAt,
    });
    const messages = [
      sent("m-1", "2026-10-28T04:30:00.000Z"),
      sent("m-2", "2026-10-28T04:35:00.000Z"),
    ];

    it("shows a single tick until the other side has read the message", () => {
      render(<MessageList messages={messages} currentUserId="me" />);
      expect(screen.getAllByRole("img", { name: "ส่งแล้ว" })).toHaveLength(2);
      expect(screen.queryByRole("img", { name: "อ่านแล้ว" })).not.toBeInTheDocument();
    });

    it("double-ticks only messages sent at or before the other side's read time", () => {
      render(
        <MessageList
          messages={messages}
          currentUserId="me"
          readUpTo="2026-10-28T04:32:00.000Z"
        />,
      );
      expect(screen.getByRole("img", { name: "อ่านแล้ว" })).toHaveTextContent("done_all");
      expect(screen.getByRole("img", { name: "ส่งแล้ว" })).toHaveTextContent("check");
    });

    it("never marks a message that is still sending as read", () => {
      render(
        <MessageList
          messages={[sent("optimistic-1", "2026-10-28T04:30:00.000Z")]}
          currentUserId="me"
          readUpTo="2026-10-28T05:00:00.000Z"
        />,
      );
      expect(screen.getByRole("img", { name: "กำลังส่ง..." })).toHaveTextContent("schedule");
    });
  });
});
