import { fireEvent, render, screen } from "@testing-library/react";
import RadioSelect from "./RadioSelect";
import Select from "./Select";

describe("RadioSelect sizing & arrow safety", () => {
  const options = [
    { value: "a", label: "Option A" },
    { value: "b", label: "Option B" },
  ];

  test.each([
    ["xs", 12, "w-3 h-3 max-w-[12px] max-h-[12px]"],
    ["sm", 14, "w-3.5 h-3.5 max-w-[14px] max-h-[14px]"],
    ["md", 16, "w-4 h-4 max-w-[16px] max-h-[16px]"],
    ["lg", 18, "w-4.5 h-4.5 max-w-[18px] max-h-[18px]"],
  ])(
    "renders size '%s' with proper arrow dimensions (%ipx)",
    (size, expectedPx, expectedClass) => {
      const { container } = render(
        <RadioSelect options={options} value="a" size={size} />,
      );

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("width", String(expectedPx));
      expect(svg).toHaveAttribute("height", String(expectedPx));
      expect(svg.style.width).toBe(`${expectedPx}px`);
      expect(svg.style.height).toBe(`${expectedPx}px`);
      expect(svg.getAttribute("class")).toContain(expectedClass);
    },
  );

  test("falls back gracefully to md dimensions if an unknown size is provided", () => {
    const { container } = render(
      <RadioSelect options={options} value="a" size="unknown_size" />,
    );

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("height", "16");
    expect(svg.style.width).toBe("16px");
    expect(svg.style.height).toBe("16px");
  });
});

test("form dropdown ignores hover and opens only on click", () => {
  render(
    <Select
      label="Filter"
      options={[{ value: "a", label: "Option A" }]}
      value="a"
    />,
  );
  const trigger = screen.getByRole("button", { name: "Option A" });
  fireEvent.mouseEnter(trigger.parentElement);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  fireEvent.mouseLeave(trigger.parentElement);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("search filters options, keeps All available and clears when reopened", () => {
  const change = jest.fn();
  render(
    <Select
      label="Style"
      searchable
      searchPlaceholder="Find a style"
      value=""
      onChange={change}
      options={[
        { value: "", label: "All" },
        { value: "vintage", label: "Vintage" },
        { value: "street", label: "Streetwear" },
      ]}
    />,
  );
  const trigger = screen.getByRole("button", { name: "All" });
  fireEvent.click(trigger);
  const search = screen.getByRole("searchbox", { name: "Find a style" });
  expect(search).toHaveFocus();
  fireEvent.change(search, { target: { value: "VINT" } });
  expect(
    screen.queryByRole("radio", { name: "Streetwear" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "All" })).toBeInTheDocument();
  fireEvent.change(search, { target: { value: "missing" } });
  expect(screen.getByRole("status")).toHaveTextContent("ไม่พบรายการที่ค้นหา");
  fireEvent.change(search, { target: { value: "vint" } });
  fireEvent.click(screen.getByRole("radio", { name: "Vintage" }));
  expect(change).toHaveBeenCalledWith(
    expect.objectContaining({
      target: expect.objectContaining({ value: "vintage" }),
    }),
  );
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  expect(screen.getByRole("searchbox", { name: "Find a style" })).toHaveValue(
    "",
  );
  expect(screen.getByRole("radio", { name: "Streetwear" })).toBeInTheDocument();
});
