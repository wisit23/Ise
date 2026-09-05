import { render, screen, fireEvent } from "@testing-library/react";
import Button from "./Button";

test("a loading button is busy and cannot be clicked twice", () => {
  const onClick = jest.fn();
  render(
    <Button loading onClick={onClick}>
      บันทึก
    </Button>,
  );

  const btn = screen.getByRole("button", { name: /บันทึก/ });
  expect(btn).toBeDisabled();
  expect(btn).toHaveAttribute("aria-busy", "true");

  fireEvent.click(btn);
  expect(onClick).not.toHaveBeenCalled();
});

test("renders a link when given href, but not while disabled", () => {
  const { rerender } = render(
    <Button href="/products">เลือกซื้อสินค้า</Button>,
  );
  expect(screen.getByRole("link", { name: "เลือกซื้อสินค้า" })).toHaveAttribute(
    "href",
    "/products",
  );

  // A disabled anchor would still be clickable, so it must fall back to a
  // real disabled button.
  rerender(
    <Button href="/products" disabled>
      เลือกซื้อสินค้า
    </Button>,
  );
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByRole("button")).toBeDisabled();
});
