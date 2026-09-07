import { fireEvent, render, screen } from "@testing-library/react";
import SwipeFeedViewer from "./SwipeFeedViewer";

jest.mock("./SwipeVideoCard", () =>
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

    expect(feed.scrollTo).toHaveBeenCalledWith({ top: 600, behavior: "smooth" });
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
});
