import { fireEvent, render, screen } from "@testing-library/react";
import SwipeFeedViewer from "./SwipeFeedViewer";

jest.mock(
  "./SwipeVideoCard",
  () =>
    function MockSwipeVideoCard({ video, isActive }) {
      return <div data-active={isActive ? "true" : "false"}>{video.title}</div>;
    },
);

const videos = [
  { id: "video-1", title: "คลิปที่หนึ่ง" },
  { id: "video-2", title: "คลิปที่สอง" },
  { id: "video-3", title: "คลิปที่สาม" },
];

function setup() {
  render(<SwipeFeedViewer videos={videos} />);
  const feed = screen.getByRole("region", { name: /ฟีดวิดีโอสินค้า/ });
  Object.defineProperty(feed, "clientHeight", {
    configurable: true,
    value: 600,
  });
  feed.scrollTo = jest.fn();
  return feed;
}

describe("SwipeFeedViewer", () => {
  it("moves to the next clip after an upward touch swipe", () => {
    const feed = setup();

    fireEvent.touchStart(feed, { touches: [{ clientY: 400 }] });
    fireEvent.touchEnd(feed, { changedTouches: [{ clientY: 300 }] });

    expect(feed.scrollTo).toHaveBeenCalledWith({
      top: 600,
      behavior: "smooth",
    });
    expect(screen.getByText("คลิปที่สอง")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("does not change clips for a short touch", () => {
    const feed = setup();

    fireEvent.touchStart(feed, { touches: [{ clientY: 400 }] });
    fireEvent.touchEnd(feed, { changedTouches: [{ clientY: 375 }] });

    expect(feed.scrollTo).not.toHaveBeenCalled();
    expect(screen.getByText("คลิปที่หนึ่ง")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("supports arrow keys and does not move past the first clip", () => {
    const feed = setup();

    fireEvent.keyDown(feed, { key: "ArrowUp" });
    expect(feed.scrollTo).toHaveBeenLastCalledWith({
      top: 0,
      behavior: "smooth",
    });

    fireEvent.keyDown(feed, { key: "ArrowDown" });
    expect(feed.scrollTo).toHaveBeenLastCalledWith({
      top: 600,
      behavior: "smooth",
    });
    expect(screen.getByText("คลิปที่สอง")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("renders desktop feed container with responsive layout and scroll snap semantics", () => {
    const feed = setup();
    expect(feed).toHaveClass("w-full");
    expect(feed).toHaveClass("sm:w-auto");
    expect(feed).toHaveClass("snap-y");
    expect(feed).toHaveClass("snap-mandatory");
  });

  it("navigates via desktop buttons", () => {
    const feed = setup();

    const nextBtn = screen.getByRole("button", { name: "คลิปถัดไป" });
    const prevBtn = screen.getByRole("button", { name: "คลิปก่อนหน้า" });

    // Initially at clip 1, prev is disabled
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    fireEvent.click(nextBtn);
    expect(feed.scrollTo).toHaveBeenCalledWith({
      top: 600,
      behavior: "smooth",
    });
    expect(screen.getByText("คลิปที่สอง")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(prevBtn).not.toBeDisabled();

    fireEvent.click(prevBtn);
    expect(feed.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(screen.getByText("คลิปที่หนึ่ง")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("restores target clip from initialVideoId prop on initial feed mount", () => {
    // Mock scrollTo on prototype before render so initialSync effect can call it
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = jest.fn();

    try {
      render(<SwipeFeedViewer videos={videos} initialVideoId="video-2" />);
      const feed = screen.getByRole("region", { name: /ฟีดวิดีโอสินค้า/ });
      Object.defineProperty(feed, "clientHeight", {
        configurable: true,
        value: 600,
      });

      expect(screen.getByText("คลิปที่สอง")).toHaveAttribute(
        "data-active",
        "true",
      );
      expect(screen.getByText("คลิปที่หนึ่ง")).toHaveAttribute(
        "data-active",
        "false",
      );
    } finally {
      HTMLElement.prototype.scrollTo = originalScrollTo;
    }
  });

  it("falls back to first clip when initialVideoId does not match any video", () => {
    render(<SwipeFeedViewer videos={videos} initialVideoId="nonexistent-id" />);
    expect(screen.getByText("คลิปที่หนึ่ง")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByText("คลิปที่สอง")).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("synchronizes active video id to browser query URL via replaceState when on /swipe", () => {
    const replaceStateSpy = jest.spyOn(window.history, "replaceState");
    window.history.replaceState(null, "", "/swipe");

    render(<SwipeFeedViewer videos={videos} />);
    const feed = screen.getByRole("region", { name: /ฟีดวิดีโอสินค้า/ });
    Object.defineProperty(feed, "clientHeight", {
      configurable: true,
      value: 600,
    });
    feed.scrollTo = jest.fn();

    const nextBtn = screen.getByRole("button", { name: "คลิปถัดไป" });
    fireEvent.click(nextBtn);

    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("/swipe?video=video-2"),
    );
    replaceStateSpy.mockRestore();
  });
});
