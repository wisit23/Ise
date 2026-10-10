import { act, fireEvent, render, screen } from "@testing-library/react";
import SwipeVideoCard from "./SwipeVideoCard";
import { apiFetch } from "../../lib/api";

jest.mock("../../lib/api", () => ({
  apiFetch: jest.fn(),
  mediaUrl: (url) => url || "/placeholder.mp4",
}));

jest.mock("../../lib/auth", () => ({
  getAccessToken: jest.fn(() => "test-token"),
}));

const mockVideo = {
  id: "vid-1",
  videoUrl: "/videos/item1.mp4",
  sellerId: "seller-1",
  sellerName: "EcoStore",
  description: "เสื้อผ้ารักษ์โลกคุณภาพดี",
  productId: "prod-1",
  product: {
    id: "prod-1",
    title: "Eco Shirt",
    price: 590,
    images: ["/images/item1.jpg"],
  },
};

describe("SwipeVideoCard", () => {
  let originalClipboard;
  let originalPlay;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    originalClipboard = navigator.clipboard;
    originalPlay = window.HTMLMediaElement.prototype.play;
  });

  afterEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: originalPlay,
    });
  });

  it("handles active playback lifecycle (autoplay on active, pause on inactive)", async () => {
    let renderResult;
    await act(async () => {
      renderResult = render(
        <SwipeVideoCard video={mockVideo} isActive={true} />,
      );
    });
    const videoEl = renderResult.container.querySelector("video");

    expect(videoEl.play).toHaveBeenCalled();
    expect(videoEl.currentTime).toBe(0);
    expect(videoEl).toHaveAttribute("aria-pressed", "true");
    expect(videoEl).toHaveAttribute(
      "aria-label",
      expect.stringContaining("หยุด"),
    );

    await act(async () => {
      renderResult.rerender(
        <SwipeVideoCard video={mockVideo} isActive={false} />,
      );
    });

    expect(videoEl.pause).toHaveBeenCalled();
    expect(videoEl).toHaveAttribute("aria-pressed", "false");
    expect(videoEl).toHaveAttribute(
      "aria-label",
      expect.stringContaining("เล่น"),
    );
  });

  it("toggles mute without resetting currentTime or forcing play when paused", async () => {
    let renderResult;
    await act(async () => {
      renderResult = render(
        <SwipeVideoCard video={mockVideo} isActive={true} />,
      );
    });
    const videoEl = renderResult.container.querySelector("video");

    // Simulate playback progressed to 15 seconds
    videoEl.currentTime = 15;

    // Pause video via keyboard Space
    await act(async () => {
      fireEvent.keyDown(videoEl, { key: " " });
    });
    expect(videoEl.pause).toHaveBeenCalled();
    expect(videoEl).toHaveAttribute("aria-pressed", "false");

    videoEl.play.mockClear();

    // Toggle mute button
    const muteButton = screen.getByRole("button", {
      name: /เปิดเสียง|ปิดเสียง/,
    });
    await act(async () => {
      fireEvent.click(muteButton);
    });

    // Mute state is updated
    expect(videoEl.muted).toBe(false);
    // Crucial: currentTime is NOT reset to 0
    expect(videoEl.currentTime).toBe(15);
    // Crucial: play() was NOT invoked, preserving paused state
    expect(videoEl.play).not.toHaveBeenCalled();
  });

  it("handles keyboard toggle (Space/Enter) for accessible play/pause", async () => {
    let renderResult;
    await act(async () => {
      renderResult = render(
        <SwipeVideoCard video={mockVideo} isActive={true} />,
      );
    });
    const videoEl = renderResult.container.querySelector("video");

    expect(videoEl).toHaveAttribute("aria-pressed", "true");

    await act(async () => {
      fireEvent.keyDown(videoEl, { key: " " });
    });
    expect(videoEl.pause).toHaveBeenCalled();
    expect(videoEl).toHaveAttribute("aria-pressed", "false");
    expect(videoEl).toHaveAttribute(
      "aria-label",
      expect.stringContaining("เล่น"),
    );

    await act(async () => {
      fireEvent.keyDown(videoEl, { key: "Enter" });
    });
    expect(videoEl.play).toHaveBeenCalled();
    expect(videoEl).toHaveAttribute("aria-pressed", "true");
    expect(videoEl).toHaveAttribute(
      "aria-label",
      expect.stringContaining("หยุด"),
    );
  });

  it("handles single-click toggle with timer debouncing", async () => {
    jest.useFakeTimers();
    try {
      const { container } = render(
        <SwipeVideoCard video={mockVideo} isActive={true} />,
      );
      const videoEl = container.querySelector("video");

      // Click video to pause (debounced 260ms)
      fireEvent.click(videoEl);
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(videoEl.pause).toHaveBeenCalled();
      expect(videoEl).toHaveAttribute("aria-pressed", "false");
    } finally {
      jest.useRealTimers();
    }
  });

  it("handles clipboard copy success with live feedback", async () => {
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    await act(async () => {
      render(<SwipeVideoCard video={mockVideo} isActive={true} />);
    });

    const shareBtn = screen.getByRole("button", { name: "แชร์คลิปนี้" });
    await act(async () => {
      fireEvent.click(shareBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith(
      "http://localhost/swipe?video=vid-1",
    );
    expect(await screen.findByText("คัดลอกแล้ว!")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "คัดลอกลิงก์สำเร็จ" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("คัดลอกลิงก์สำเร็จ");
  });

  it("handles clipboard rejection cleanly without unhandled rejection and shows error feedback", async () => {
    const writeTextMock = jest
      .fn()
      .mockRejectedValue(new Error("Permission denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    await act(async () => {
      render(<SwipeVideoCard video={mockVideo} isActive={true} />);
    });

    const shareBtn = screen.getByRole("button", { name: "แชร์คลิปนี้" });
    await act(async () => {
      fireEvent.click(shareBtn);
    });

    expect(writeTextMock).toHaveBeenCalled();
    expect(await screen.findByText("ล้มเหลว")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ไม่สามารถคัดลอกลิงก์ได้" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "ไม่สามารถคัดลอกลิงก์ได้",
    );
  });

  it("handles Clipboard API unavailability gracefully", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    await act(async () => {
      render(<SwipeVideoCard video={mockVideo} isActive={true} />);
    });

    const shareBtn = screen.getByRole("button", { name: "แชร์คลิปนี้" });
    await act(async () => {
      fireEvent.click(shareBtn);
    });

    expect(await screen.findByText("ล้มเหลว")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ไม่สามารถคัดลอกลิงก์ได้" }),
    ).toBeInTheDocument();
  });

  it("handles double tap to like/choose once and cancels single-tap play/pause toggle", async () => {
    jest.useFakeTimers();
    try {
      const { container } = render(
        <SwipeVideoCard video={mockVideo} isActive={true} />,
      );
      const videoEl = container.querySelector("video");
      videoEl.pause.mockClear();
      videoEl.play.mockClear();

      apiFetch.mockResolvedValueOnce({ success: true });

      // First tap
      fireEvent.click(videoEl);
      // Second tap within 260ms (e.g. 100ms)
      act(() => {
        jest.advanceTimersByTime(100);
      });
      fireEvent.click(videoEl);

      // Advance timers past the single-tap debounce window (260ms) and heart animation
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Single-tap toggle was canceled: pause was not called
      expect(videoEl.pause).not.toHaveBeenCalled();
      expect(videoEl).toHaveAttribute("aria-pressed", "true");

      // Double-tap choose was triggered exactly once
      expect(apiFetch).toHaveBeenCalledTimes(1);
      expect(apiFetch).toHaveBeenCalledWith(
        `/api/products/videos/${mockVideo.id}/choose`,
        { method: "POST" },
      );

      // Additional double tap after already chosen does not call choose again
      fireEvent.click(videoEl);
      act(() => {
        jest.advanceTimersByTime(100);
      });
      fireEvent.click(videoEl);
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(apiFetch).toHaveBeenCalledTimes(1);
      expect(videoEl.pause).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("resets currentTime to 0 from a non-zero value upon becoming active", async () => {
    let renderResult;
    await act(async () => {
      renderResult = render(
        <SwipeVideoCard video={mockVideo} isActive={false} />,
      );
    });
    const videoEl = renderResult.container.querySelector("video");

    // Simulate currentTime had progressed to a non-zero value
    videoEl.currentTime = 18.5;
    expect(videoEl.currentTime).toBe(18.5);

    videoEl.play.mockClear();

    // Transition to active
    await act(async () => {
      renderResult.rerender(
        <SwipeVideoCard video={mockVideo} isActive={true} />,
      );
    });

    // currentTime must be explicitly reset to 0
    expect(videoEl.currentTime).toBe(0);
    expect(videoEl.play).toHaveBeenCalled();
  });

  it("handles autoplay rejection gracefully and updates isPlaying state to false", async () => {
    const playMock = jest
      .fn()
      .mockRejectedValue(new Error("NotAllowedError: play() failed"));
    Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: playMock,
    });

    let renderResult;
    await act(async () => {
      renderResult = render(
        <SwipeVideoCard video={mockVideo} isActive={true} />,
      );
    });
    const videoEl = renderResult.container.querySelector("video");

    expect(playMock).toHaveBeenCalled();
    expect(videoEl).toHaveAttribute("aria-pressed", "false");
    expect(videoEl).toHaveAttribute(
      "aria-label",
      expect.stringContaining("เล่น"),
    );
  });

  it("guards against stale video.play() Promise resolving after switching to inactive", async () => {
    let resolvePlayPromise;
    const slowPlayPromise = new Promise((resolve) => {
      resolvePlayPromise = resolve;
    });
    const playMock = jest.fn(() => slowPlayPromise);
    Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: playMock,
    });

    let renderResult;
    await act(async () => {
      renderResult = render(
        <SwipeVideoCard video={mockVideo} isActive={true} />,
      );
    });
    const videoEl = renderResult.container.querySelector("video");
    expect(playMock).toHaveBeenCalled();

    // User switches to inactive before playPromise resolves
    await act(async () => {
      renderResult.rerender(
        <SwipeVideoCard video={mockVideo} isActive={false} />,
      );
    });

    expect(videoEl.pause).toHaveBeenCalled();
    expect(videoEl).toHaveAttribute("aria-pressed", "false");

    // The stale playPromise from the previous active state now resolves
    await act(async () => {
      resolvePlayPromise();
    });

    // Guard prevents the stale promise from setting isPlaying to true
    expect(videoEl).toHaveAttribute("aria-pressed", "false");
    expect(videoEl).toHaveAttribute(
      "aria-label",
      expect.stringContaining("เล่น"),
    );
  });

  it("guards against clipboard Promise resolving after component unmount without unhandled error or scheduling feedback timers", async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, "setTimeout");
    let resolveClipboard;
    const pendingClipboardPromise = new Promise((resolve) => {
      resolveClipboard = resolve;
    });
    const writeTextMock = jest.fn(() => pendingClipboardPromise);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const { unmount } = render(
        <SwipeVideoCard video={mockVideo} isActive={true} />,
      );

      const shareBtn = screen.getByRole("button", { name: "แชร์คลิปนี้" });
      await act(async () => {
        fireEvent.click(shareBtn);
      });

      expect(writeTextMock).toHaveBeenCalled();

      // Unmount while clipboard Promise is still pending
      unmount();
      setTimeoutSpy.mockClear();

      // Now clipboard promise resolves
      await act(async () => {
        resolveClipboard();
      });

      // Guard successfully aborted: no feedback timer was scheduled after unmount
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it("guards against clipboard Promise rejecting after component unmount without unhandled error or scheduling error timers", async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, "setTimeout");
    let rejectClipboard;
    const pendingClipboardPromise = new Promise((_, reject) => {
      rejectClipboard = reject;
    });
    const writeTextMock = jest.fn(() => pendingClipboardPromise);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });

    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const { unmount } = render(
        <SwipeVideoCard video={mockVideo} isActive={true} />,
      );

      const shareBtn = screen.getByRole("button", { name: "แชร์คลิปนี้" });
      await act(async () => {
        fireEvent.click(shareBtn);
      });

      expect(writeTextMock).toHaveBeenCalled();

      // Unmount while clipboard Promise is still pending
      unmount();
      setTimeoutSpy.mockClear();

      // Now clipboard promise rejects
      await act(async () => {
        rejectClipboard(new Error("Permission denied after unmount"));
      });

      // Guard successfully aborted: no error feedback timer was scheduled after unmount
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it("cleans up active timers (click, play icon, heart, share) on unmount", async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, "setTimeout");
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      // Simulate clipboard unavailable so handleShare immediately sets shareTimerRef synchronously
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: undefined,
      });

      const { container, unmount } = render(
        <SwipeVideoCard video={mockVideo} isActive={true} />,
      );
      const videoEl = container.querySelector("video");

      setTimeoutSpy.mockClear();
      clearTimeoutSpy.mockClear();

      // 1. Trigger play icon timer via keyboard toggle
      fireEvent.keyDown(videoEl, { key: " " });
      const playIconTimerId =
        setTimeoutSpy.mock.results[setTimeoutSpy.mock.results.length - 1]
          ?.value;

      // 2. Trigger double-click (triggers heartTimerRef)
      fireEvent.click(videoEl);
      fireEvent.click(videoEl);
      const heartTimerId =
        setTimeoutSpy.mock.results[setTimeoutSpy.mock.results.length - 1]
          ?.value;

      // 3. Trigger single click to set clickTimerRef
      fireEvent.click(videoEl);
      const clickTimerId =
        setTimeoutSpy.mock.results[setTimeoutSpy.mock.results.length - 1]
          ?.value;

      // 4. Trigger share button (sets shareTimerRef synchronously when clipboard unavailable)
      const shareBtn = screen.getByRole("button", { name: /แชร์/ });
      fireEvent.click(shareBtn);
      const shareTimerId =
        setTimeoutSpy.mock.results[setTimeoutSpy.mock.results.length - 1]
          ?.value;

      expect(playIconTimerId).toBeDefined();
      expect(heartTimerId).toBeDefined();
      expect(clickTimerId).toBeDefined();
      expect(shareTimerId).toBeDefined();

      clearTimeoutSpy.mockClear();

      // Unmount while all 4 timers are active
      unmount();

      // Explicitly prove that clearTimeout was invoked for EACH of the 4 timer paths
      expect(clearTimeoutSpy).toHaveBeenCalledWith(playIconTimerId);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(heartTimerId);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(clickTimerId);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(shareTimerId);

      // Advancing timers after unmount should not throw or trigger console errors
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it("does not render ambient background or fallback gradient behind the card so it blends seamlessly with the page background", () => {
    const { container } = render(
      <SwipeVideoCard video={mockVideo} isActive={true} />,
    );

    // No blurred ambient element and no gradient element behind the card
    expect(container.querySelector(".blur-3xl")).toBeNull();
    expect(container.querySelector(".bg-gradient-to-b")).toBeNull();
  });

  it("renders vertical 9:16 frame and places action rail outside the frame on desktop", () => {
    const { container } = render(
      <SwipeVideoCard video={mockVideo} isActive={true} />,
    );

    const videoElement = container.querySelector("video");
    expect(videoElement).toBeInTheDocument();

    const videoFrame = videoElement?.parentElement;
    expect(videoFrame).toBeInTheDocument();
    expect(videoFrame).toHaveClass("sm:aspect-[9/16]");

    const actionRail = container.querySelector("aside");
    expect(actionRail).toBeInTheDocument();

    // Action rail is a sibling to videoFrame on desktop, NOT enclosed within the video frame
    expect(videoFrame.contains(actionRail)).toBe(false);
    expect(actionRail).toHaveClass("sm:relative");
    expect(actionRail).toHaveClass("sm:ml-4");
  });

  it("renders action rail elements in exact order: avatar, like, comment, share", () => {
    const { container } = render(
      <SwipeVideoCard video={mockVideo} isActive={true} />,
    );

    const actionRail = container.querySelector(
      "aside[aria-label='การทำงานบนวิดีโอ']",
    );
    expect(actionRail).toBeInTheDocument();

    const avatarLink = screen.getByRole("link", {
      name: `ร้านค้า ${mockVideo.sellerName}`,
    });
    const likeBtn = screen.getByRole("button", { name: "สนใจสินค้านี้" });
    const commentBtn = screen.getByRole("button", { name: "ความคิดเห็น" });
    const shareBtn = screen.getByRole("button", { name: "แชร์คลิปนี้" });

    expect(avatarLink).toBeInTheDocument();
    expect(likeBtn).toBeInTheDocument();
    expect(commentBtn).toBeInTheDocument();
    expect(shareBtn).toBeInTheDocument();

    // Explicitly prove DOM sequence avatar -> like -> comment -> share
    expect(
      Boolean(
        avatarLink.compareDocumentPosition(likeBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(
      Boolean(
        likeBtn.compareDocumentPosition(commentBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(
      Boolean(
        commentBtn.compareDocumentPosition(shareBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  it("renders product card above seller name and description inside video overlay", () => {
    render(<SwipeVideoCard video={mockVideo} isActive={true} />);

    expect(screen.getByText(`@${mockVideo.sellerName}`)).toBeInTheDocument();
    expect(screen.getByText(mockVideo.description)).toBeInTheDocument();
    expect(screen.getByText("Eco Shirt")).toBeInTheDocument();
    expect(screen.getByText("฿590")).toBeInTheDocument();

    const productLink = screen.getByRole("link", { name: /Eco Shirt/ });
    expect(productLink).toHaveAttribute(
      "href",
      `/products/${mockVideo.productId}`,
    );

    // Explicitly verify product link is above seller name in DOM order
    const sellerEl = screen.getByText(`@${mockVideo.sellerName}`);
    expect(
      Boolean(
        productLink.compareDocumentPosition(sellerEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  it("supports iOS safe-area-inset-bottom on mobile and preserves desktop padding", () => {
    render(<SwipeVideoCard video={mockVideo} isActive={true} />);

    const bottomOverlay = screen.getByTestId("bottom-overlay");
    expect(bottomOverlay).toBeInTheDocument();
    expect(bottomOverlay.className).toMatch(/safe-area-inset-bottom/);
    expect(bottomOverlay.className).toMatch(/sm:pb-5/);
  });

  it("provides accessible comment modal with full focus lifecycle, tab trapping, backdrop dismissal, and focus restoration", async () => {
    render(<SwipeVideoCard video={mockVideo} isActive={true} />);

    const commentBtn = screen.getByRole("button", { name: "ความคิดเห็น" });
    commentBtn.focus();
    expect(document.activeElement).toBe(commentBtn);

    fireEvent.click(commentBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute(
      "aria-labelledby",
      `comment-title-${mockVideo.id}`,
    );
    expect(dialog).toHaveAttribute(
      "aria-describedby",
      `comment-desc-${mockVideo.id}`,
    );

    const closeBtn = screen.getByRole("button", {
      name: "ปิดหน้าต่างความคิดเห็น",
    });
    const dismissBtn = screen.getByRole("button", { name: "ปิด" });

    // Focus immediately transitions to first focusable element (close button)
    expect(document.activeElement).toBe(closeBtn);

    // Tab forwards wraps to productReviewLink -> dismissBtn -> closeBtn
    dismissBtn.focus();
    expect(document.activeElement).toBe(dismissBtn);

    // Press Tab from last focusable element wraps back to first (closeBtn)
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab from first element wraps to last (dismissBtn)
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(dismissBtn);

    // Escape closes dialog and restores focus to trigger button
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(commentBtn);

    // Re-open dialog and dismiss via backdrop click
    fireEvent.click(commentBtn);
    const reOpenedDialog = screen.getByRole("dialog");
    expect(reOpenedDialog).toBeInTheDocument();

    // Clicking backdrop (outer dialog container) closes dialog and restores focus
    fireEvent.click(reOpenedDialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(commentBtn);
  });

  it("enforces semantic responsive layout and safe-area contracts", () => {
    const { container } = render(
      <SwipeVideoCard video={mockVideo} isActive={true} />,
    );

    // Video frame is 9:16 aspect ratio on desktop
    const videoFrame = container.querySelector("video")?.parentElement;
    expect(videoFrame).toHaveClass("sm:aspect-[9/16]");

    // Sound control has mobile safe-area-inset-top clearance and desktop fixed position
    const soundBtn = screen.getByRole("button", {
      name: /เปิดเสียง|ปิดเสียง/,
    });
    const soundContainer = soundBtn.parentElement;
    expect(soundContainer?.className).toMatch(/safe-area-inset-top/);
    expect(soundContainer?.className).toMatch(/sm:top-4/);

    // Action rail is placed outside video frame on desktop
    const actionRail = container.querySelector("aside");
    expect(actionRail).toHaveClass("sm:relative");
    expect(actionRail).toHaveClass("sm:ml-4");
    // Action rail on mobile is positioned absolute with right-3
    expect(actionRail).toHaveClass("absolute");
    expect(actionRail).toHaveClass("right-3");
  });

  it("opens honest comment affordance dialog with link to product reviews and closes on Esc", () => {
    render(<SwipeVideoCard video={mockVideo} isActive={true} />);

    const commentBtn = screen.getByRole("button", { name: "ความคิดเห็น" });
    fireEvent.click(commentBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByText("ยังไม่มีระบบความคิดเห็นบนคลิปวิดีโอ"),
    ).toBeInTheDocument();

    const productReviewLink = screen.getByRole("link", {
      name: "ดูรีวิวและรายละเอียดสินค้า",
    });
    expect(productReviewLink).toHaveAttribute(
      "href",
      `/products/${mockVideo.productId}`,
    );

    // Press Escape to close dialog
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("allows toggling like on and off (like and unlike)", async () => {
    apiFetch.mockResolvedValue({ success: true });

    await act(async () => {
      render(<SwipeVideoCard video={mockVideo} isActive={true} />);
    });

    const likeBtn = screen.getByRole("button", { name: "สนใจสินค้านี้" });
    expect(likeBtn).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("ถูกใจ")).toBeInTheDocument();

    // 1. Click to like
    await act(async () => {
      fireEvent.click(likeBtn);
    });

    expect(apiFetch).toHaveBeenLastCalledWith(
      `/api/products/videos/${mockVideo.id}/choose`,
      { method: "POST" },
    );
    expect(likeBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("ถูกใจแล้ว")).toBeInTheDocument();

    // 2. Click again to unlike
    await act(async () => {
      fireEvent.click(likeBtn);
    });

    expect(apiFetch).toHaveBeenLastCalledWith(
      `/api/products/videos/${mockVideo.id}/choose`,
      { method: "DELETE" },
    );
    expect(likeBtn).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("ถูกใจ")).toBeInTheDocument();
  });

  it("allows toggling seller follow on and off", async () => {
    await act(async () => {
      render(<SwipeVideoCard video={mockVideo} isActive={true} />);
    });

    const followBtn = screen.getByRole("button", {
      name: `ติดตาม ${mockVideo.sellerName}`,
    });
    expect(followBtn).toHaveAttribute("aria-pressed", "false");

    // 1. Click to follow
    await act(async () => {
      fireEvent.click(followBtn);
    });

    expect(followBtn).toHaveAttribute("aria-pressed", "true");
    expect(followBtn).toHaveAttribute(
      "aria-label",
      `เลิกติดตาม ${mockVideo.sellerName}`,
    );

    // 2. Click again to unfollow
    await act(async () => {
      fireEvent.click(followBtn);
    });

    expect(followBtn).toHaveAttribute("aria-pressed", "false");
    expect(followBtn).toHaveAttribute(
      "aria-label",
      `ติดตาม ${mockVideo.sellerName}`,
    );
  });
});
