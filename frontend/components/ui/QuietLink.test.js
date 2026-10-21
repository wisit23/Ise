import { fireEvent, render, screen } from "@testing-library/react";
import QuietLink from "./QuietLink";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: jest.fn() }),
}));

describe("QuietLink", () => {
  beforeEach(() => {
    push.mockClear();
    window.open = jest.fn();
  });

  it("is a link with no href, so the browser has no URL to preview", () => {
    render(<QuietLink href="/products/p1">ดูสินค้า</QuietLink>);
    const link = screen.getByRole("link", { name: "ดูสินค้า" });
    expect(link).not.toHaveAttribute("href");
  });

  it("navigates in-app on click and Enter", () => {
    render(<QuietLink href="/products/p1">ดูสินค้า</QuietLink>);
    const link = screen.getByRole("link");
    fireEvent.click(link);
    fireEvent.keyDown(link, { key: "Enter" });
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith("/products/p1");
  });

  it("opens a new tab on Ctrl-click and middle click, like a real link", () => {
    render(<QuietLink href="/products/p1">ดูสินค้า</QuietLink>);
    const link = screen.getByRole("link");
    fireEvent.click(link, { ctrlKey: true });
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(window.open).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
  });
});
