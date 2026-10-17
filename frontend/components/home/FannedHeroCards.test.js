import { act, fireEvent, render, screen } from "@testing-library/react";
import FannedHeroCards from "./FannedHeroCards";

jest.mock(
  "../ProductCard",
  () =>
    function MockProductCard({ product }) {
      return (
        <article>
          <a href={`/products/${product.id}`}>{product.title}</a>
        </article>
      );
    },
);

const items = [0, 1, 2].map((id) => ({
  id,
  title: `Product ${id}`,
  media: [{ url: "/product.png" }],
}));

describe("FannedHeroCards interaction", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("keeps the selection across gaps between moving cards and resets outside the deck", () => {
    const { container } = render(<FannedHeroCards items={items} />);
    const deck = container.firstChild;
    const left = screen
      .getByRole("link", { name: "Product 0" })
      .closest("article").parentElement;
    const right = screen
      .getByRole("link", { name: "Product 2" })
      .closest("article").parentElement;

    fireEvent.pointerEnter(left);
    expect(left.style.zIndex).toBe("30");
    fireEvent(
      left,
      new MouseEvent("pointerout", { bubbles: true, relatedTarget: deck }),
    );
    act(() => jest.advanceTimersByTime(400));
    expect(left.style.zIndex).toBe("30");

    fireEvent.pointerEnter(right);
    expect(right.style.zIndex).toBe("30");
    fireEvent.pointerLeave(deck);
    act(() => jest.advanceTimersByTime(50));
    fireEvent.pointerEnter(right);
    act(() => jest.advanceTimersByTime(100));
    expect(right.style.zIndex).toBe("30");

    fireEvent.pointerLeave(deck);
    act(() => jest.advanceTimersByTime(100));
    expect(right.style.zIndex).toBe("2");
  });

  it("brings keyboard focused cards forward and resets after focus leaves", () => {
    const { container } = render(<FannedHeroCards items={items} />);
    const link = screen.getByRole("link", { name: "Product 0" });
    const card = link.closest("article").parentElement;
    fireEvent.focus(link);
    expect(card.style.zIndex).toBe("30");
    fireEvent.blur(link, { relatedTarget: document.body });
    act(() => jest.advanceTimersByTime(100));
    expect(card.style.zIndex).toBe("1");
    expect(container.querySelectorAll("article")).toHaveLength(3);
  });
});
