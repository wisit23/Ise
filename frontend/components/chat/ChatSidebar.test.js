import { render, screen, fireEvent } from "@testing-library/react";
import ChatSidebar from "./ChatSidebar";

describe("ChatSidebar", () => {
  const conversations = [
    {
      id: "conv-1",
      participants: [
        { userId: "user-me", role: "BUYER" },
        { userId: "user-2", role: "SELLER", displayName: "ร้านเสื้อผ้าวินเทจ" },
      ],
      lastMessagePreview: "เสื้อยังมีของไหมครับ",
      lastMessageAt: "2026-09-04T10:00:00Z",
    },
    {
      id: "conv-2",
      participants: [
        { userId: "user-me", role: "BUYER" },
        { userId: "user-3", role: "SELLER", displayName: "ShoeCollector" },
      ],
      lastMessagePreview: "รองเท้าไซส์ 42",
      lastMessageAt: "2026-09-04T09:00:00Z",
    },
  ];

  it("filters conversations based on search query", () => {
    render(
      <ChatSidebar
        conversations={conversations}
        currentUserId="user-me"
        activeId="conv-1"
      />,
    );

    expect(screen.getByText("ร้านเสื้อผ้าวินเทจ")).toBeInTheDocument();
    expect(screen.getByText("ShoeCollector")).toBeInTheDocument();

    const searchInput = screen.getByLabelText("ค้นหาการสนทนา");
    fireEvent.change(searchInput, { target: { value: "วินเทจ" } });

    expect(screen.getByText("ร้านเสื้อผ้าวินเทจ")).toBeInTheDocument();
    expect(screen.queryByText("ShoeCollector")).not.toBeInTheDocument();

    // Clear search
    fireEvent.click(screen.getByLabelText("ล้างการค้นหา"));
    expect(screen.getByText("ShoeCollector")).toBeInTheDocument();
  });

  it("calls onSelectConversation when a row is clicked", () => {
    const handleSelect = jest.fn();
    render(
      <ChatSidebar
        conversations={conversations}
        currentUserId="user-me"
        activeId="conv-1"
        onSelectConversation={handleSelect}
      />,
    );

    fireEvent.click(screen.getByText("ShoeCollector"));
    expect(handleSelect).toHaveBeenCalledWith("conv-2");
  });

  it("shows unread badge on inactive room, but hides unread badge when room is active", () => {
    const unreadConvs = [
      {
        id: "conv-unread-1",
        participants: [
          {
            userId: "user-me",
            role: "BUYER",
            lastReadAt: "2026-09-04T08:00:00Z",
          },
          {
            userId: "user-2",
            role: "SELLER",
            displayName: "ร้านเสื้อผ้าวินเทจ",
          },
        ],
        lastMessagePreview: "เสื้อยังมีของไหมครับ",
        lastMessageAt: "2026-09-04T10:00:00Z",
      },
    ];

    // When conv-unread-1 is NOT active, unread indicator is present
    const { rerender } = render(
      <ChatSidebar
        conversations={unreadConvs}
        currentUserId="user-me"
        activeId="other-conv"
      />,
    );
    expect(screen.getByLabelText("มีข้อความใหม่")).toBeInTheDocument();

    // When conv-unread-1 IS active, unread indicator must NOT be shown
    rerender(
      <ChatSidebar
        conversations={unreadConvs}
        currentUserId="user-me"
        activeId="conv-unread-1"
      />,
    );
    expect(screen.queryByLabelText("มีข้อความใหม่")).not.toBeInTheDocument();
  });

  it("shows header badge only when there are unread conversations, and disappears when 0", () => {
    const unreadConvs = [
      {
        id: "conv-unread-1",
        participants: [
          {
            userId: "user-me",
            role: "BUYER",
            lastReadAt: "2026-09-04T08:00:00Z",
          },
          {
            userId: "user-2",
            role: "SELLER",
            displayName: "ร้านเสื้อผ้าวินเทจ",
          },
        ],
        lastMessagePreview: "เสื้อยังมีของไหมครับ",
        lastMessageAt: "2026-09-04T10:00:00Z",
      },
      {
        id: "conv-read-2",
        participants: [
          {
            userId: "user-me",
            role: "BUYER",
            lastReadAt: "2026-09-04T11:00:00Z",
          },
          {
            userId: "user-3",
            role: "SELLER",
            displayName: "ร้านรองเท้า",
          },
        ],
        lastMessagePreview: "ขอบคุณครับ",
        lastMessageAt: "2026-09-04T09:00:00Z",
      },
    ];

    // Inactive, conv-unread-1 is unread -> unreadTotal = 1
    const { rerender } = render(
      <ChatSidebar
        conversations={unreadConvs}
        currentUserId="user-me"
        activeId={null}
      />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();

    // When conv-unread-1 is active (or marked read), unreadTotal = 0 -> badge disappears
    rerender(
      <ChatSidebar
        conversations={unreadConvs}
        currentUserId="user-me"
        activeId="conv-unread-1"
      />,
    );
    expect(
      screen.queryByLabelText(/การสนทนาที่ยังไม่ได้อ่าน/),
    ).not.toBeInTheDocument();
  });

  it("does not render fake online indicator when users are offline", () => {
    render(
      <ChatSidebar
        conversations={conversations}
        currentUserId="user-me"
        activeId="conv-1"
      />,
    );

    // By default offline users do not show green dot indicators
    expect(screen.queryByTestId("online-indicator")).not.toBeInTheDocument();
  });
});
