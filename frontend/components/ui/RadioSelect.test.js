import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import RadioSelect from "./RadioSelect";
import Modal from "./Modal";

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

  test("constrains listbox maxHeight and enables internal scrolling when opened in a 1024x768 viewport", () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 768,
    });

    try {
      const { container } = render(
        <RadioSelect
          ariaLabel="ตัวกรองสถานะ"
          options={options}
          value="a"
        />,
      );

      const wrapper = container.firstChild;
      jest.spyOn(wrapper, "getBoundingClientRect").mockReturnValue({
        top: 520,
        bottom: 560,
        left: 300,
        right: 480,
        width: 180,
        height: 40,
      });

      fireEvent.click(screen.getByRole("button", { name: "ตัวกรองสถานะ" }));

      const listbox = screen.getByRole("listbox");
      expect(listbox).toHaveClass("top-full", "overflow-y-auto", "overscroll-contain");
      expect(listbox.style.maxHeight).toBe("184px");
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        writable: true,
        value: originalInnerHeight,
      });
    }
  });

  test("flips listbox upward when space below is insufficient and space above is larger", () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 768,
    });

    try {
      const { container } = render(
        <RadioSelect
          ariaLabel="ตัวกรองสถานะ"
          options={options}
          value="a"
        />,
      );

      const wrapper = container.firstChild;
      jest.spyOn(wrapper, "getBoundingClientRect").mockReturnValue({
        top: 660,
        bottom: 700,
        left: 300,
        right: 480,
        width: 180,
        height: 40,
      });

      fireEvent.click(screen.getByRole("button", { name: "ตัวกรองสถานะ" }));

      const listbox = screen.getByRole("listbox");
      expect(listbox).toHaveClass("bottom-full", "overflow-y-auto");
      expect(listbox.style.maxHeight).toBe("280px");
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        writable: true,
        value: originalInnerHeight,
      });
    }
  });

  test("constrains listbox maxHeight to container bounds when rendered inside a scroll or modal container", () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 768,
    });

    try {
      render(
        <div
          data-testid="modal-container"
          style={{ overflowY: "auto", height: "600px" }}
        >
          <RadioSelect
            ariaLabel="ตัวเลือกในโมดอล"
            options={options}
            value="a"
          />
        </div>,
      );

      const modalContainer = screen.getByTestId("modal-container");
      jest.spyOn(modalContainer, "getBoundingClientRect").mockReturnValue({
        top: 38.4,
        bottom: 729.6,
        left: 200,
        right: 824,
        width: 624,
        height: 691.2,
      });

      const wrapper = modalContainer.firstChild;
      jest.spyOn(wrapper, "getBoundingClientRect").mockReturnValue({
        top: 455,
        bottom: 495,
        left: 220,
        right: 420,
        width: 200,
        height: 40,
      });

      fireEvent.click(screen.getByRole("button", { name: "ตัวเลือกในโมดอล" }));

      const listbox = screen.getByRole("listbox");
      expect(listbox).toHaveClass("top-full");
      // clippingBottom = 729.6, rect.bottom = 495, margin = 16, gap = 8 => 210.6px -> 210px
      expect(listbox.style.maxHeight).toBe("210px");
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        writable: true,
        value: originalInnerHeight,
      });
    }
  });

  test("flips upward inside a scroll or modal container when downward space is insufficient", () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 768,
    });

    try {
      render(
        <div
          data-testid="modal-container"
          style={{ overflowY: "auto", height: "600px" }}
        >
          <RadioSelect
            ariaLabel="ตัวเลือกใกล้ขอบล่างโมดอล"
            options={options}
            value="a"
          />
        </div>,
      );

      const modalContainer = screen.getByTestId("modal-container");
      jest.spyOn(modalContainer, "getBoundingClientRect").mockReturnValue({
        top: 38.4,
        bottom: 729.6,
        left: 200,
        right: 824,
        width: 624,
        height: 691.2,
      });

      const wrapper = modalContainer.firstChild;
      jest.spyOn(wrapper, "getBoundingClientRect").mockReturnValue({
        top: 610,
        bottom: 650,
        left: 220,
        right: 420,
        width: 200,
        height: 40,
      });

      fireEvent.click(
        screen.getByRole("button", { name: "ตัวเลือกใกล้ขอบล่างโมดอล" }),
      );

      const listbox = screen.getByRole("listbox");
      expect(listbox).toHaveClass("bottom-full");
      // spaceAbove = 610 - 38.4 - 16 - 8 = 547.6 => capped at default 280px
      expect(listbox.style.maxHeight).toBe("280px");
    } finally {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        writable: true,
        value: originalInnerHeight,
      });
    }
  });

  test("renders accessible native select when nativeAriaLabel is provided", () => {
    const handleChange = jest.fn();
    render(
      <RadioSelect
        nativeAriaLabel="เลือกหมวดหมู่ที่สนใจ"
        options={options}
        value="a"
        onChange={handleChange}
      />,
    );
    const select = screen.getByLabelText("เลือกหมวดหมู่ที่สนใจ");
    expect(select).toBeInTheDocument();
    expect(select.value).toBe("a");
    fireEvent.change(select, { target: { value: "b" } });
    expect(handleChange).toHaveBeenCalledWith("b");
  });
});

describe("RadioSelect inside Modal Escape & focus regression", () => {
  const options = [
    { value: "percent", label: "ลดเป็นเปอร์เซ็นต์ (%)" },
    { value: "fixed", label: "ลดเป็นจำนวนเงินคงที่ (บาท)" },
  ];

  function ModalFormHarness({ onClose }) {
    const [open, setOpen] = useState(true);
    const [campaignName, setCampaignName] = useState("Summer Sale");
    const [discountType, setDiscountType] = useState("percent");

    return (
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
        title="สร้างแคมเปญใหม่"
      >
        <form>
          <label htmlFor="campaign-name">ชื่อแคมเปญ</label>
          <input
            id="campaign-name"
            aria-label="ชื่อแคมเปญ"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
          />
          <label htmlFor="discount-type">ประเภทส่วนลด</label>
          <RadioSelect
            id="discount-type"
            ariaLabel="ประเภทส่วนลด"
            options={options}
            value={discountType}
            onChange={setDiscountType}
          />
        </form>
      </Modal>
    );
  }

  test("pressing Escape when dropdown is open closes only the dropdown, preserves modal and form values, returns focus to trigger; pressing Escape when closed closes modal", () => {
    const handleClose = jest.fn();
    render(<ModalFormHarness onClose={handleClose} />);

    // Check modal is open
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Fill form input
    const nameInput = screen.getByLabelText("ชื่อแคมเปญ");
    fireEvent.change(nameInput, { target: { value: "Flash Sale 2026" } });
    expect(nameInput.value).toBe("Flash Sale 2026");

    // Open dropdown
    const trigger = screen.getByRole("button", { name: "ประเภทส่วนลด" });
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveClass("visible");

    // Press Escape while dropdown is open
    fireEvent.keyDown(trigger, { key: "Escape" });

    // 1. Dropdown is closed
    expect(listbox).toHaveClass("invisible");

    // 2. Modal is still open
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(handleClose).not.toHaveBeenCalled();

    // 3. Form value is preserved
    expect(screen.getByLabelText("ชื่อแคมเปญ").value).toBe("Flash Sale 2026");

    // 4. Focus returned to trigger button
    expect(document.activeElement).toBe(trigger);

    // 5. Press Escape again when dropdown is closed -> Modal closes
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("supports selecting option and closing on outside click within modal", () => {
    const handleClose = jest.fn();
    render(<ModalFormHarness onClose={handleClose} />);

    // Open dropdown and select option
    const trigger = screen.getByRole("button", { name: "ประเภทส่วนลด" });
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveClass("visible");

    // Select second option
    const fixedOption = within(listbox).getByText("ลดเป็นจำนวนเงินคงที่ (บาท)");
    fireEvent.click(fixedOption);

    // Dropdown closes, option selected, modal remains open
    expect(listbox).toHaveClass("invisible");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(handleClose).not.toHaveBeenCalled();
    expect(trigger).toHaveTextContent("ลดเป็นจำนวนเงินคงที่ (บาท)");

    // Re-open and test outside click
    fireEvent.click(trigger);
    expect(listbox).toHaveClass("visible");

    // Click outside on modal input
    fireEvent.mouseDown(screen.getByLabelText("ชื่อแคมเปญ"));
    expect(listbox).toHaveClass("invisible");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
