import { render } from "@testing-library/react";
import RadioSelect from "./RadioSelect";

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
