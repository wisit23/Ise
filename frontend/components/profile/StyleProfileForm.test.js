import { act, fireEvent, render, screen, within } from "@testing-library/react";
import StyleProfileForm from "./StyleProfileForm";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";
import { fetchCategories } from "../../lib/catalog";
jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("../../lib/auth", () => ({ getAccessToken: jest.fn() }));
jest.mock("../../lib/catalog", () => ({ fetchCategories: jest.fn() }));
const EMPTY = {
  categories: [],
  styles: [],
  brands: [],
  sizes: [],
  unassignedSizes: [],
};
let saved;
const clone = (value) => JSON.parse(JSON.stringify(value));
const group = (label) => within(screen.getByRole("group", { name: label }));
const ready = () => screen.findByRole("button", { name: /บันทึกความสนใจ/ });
function open(label) {
  fireEvent.click(group(label).getByRole("button", { name: /เพิ่ม \/ แก้ไข/ }));
  return within(screen.getByRole("dialog"));
}
function choose(label, values) {
  const dialog = open(label);
  for (const value of values) {
    const checkbox = dialog.getByRole("checkbox", { name: value });
    if (!checkbox.checked) fireEvent.click(checkbox);
  }
  fireEvent.click(dialog.getByRole("button", { name: "ยืนยัน" }));
}
async function save() {
  fireEvent.click(screen.getByRole("button", { name: /บันทึกความสนใจ/ }));
  await screen.findByText("บันทึกความสนใจสำเร็จ");
}
function addGroup(category) {
  fireEvent.change(screen.getByLabelText("ประเภทสินค้าที่ต้องการเพิ่ม"), {
    target: { value: category },
  });
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มกลุ่มขนาด" }));
}
beforeEach(() => {
  jest.resetAllMocks();
  saved = clone(EMPTY);
  getAccessToken.mockReturnValue("buyer-token");
  fetchCategories.mockResolvedValue(["เสื้อ", "รองเท้า"]);
  apiFetch.mockImplementation((path, options) => {
    if (path === "/api/products/filters")
      return Promise.resolve({
        styles: ["minimal", "vintage"],
        brands: ["Nike", "Uniqlo"],
        sizesByCategory: [
          { category: "เสื้อ", values: ["M", "L"] },
          { category: "รองเท้า", values: ["40", "41"] },
        ],
      });
    if (options?.method === "PATCH") saved = clone(options.body);
    return Promise.resolve(clone(saved));
  });
});
it("shows only selected values on the page, with no unchecked choices or size inputs", async () => {
  saved = {
    ...EMPTY,
    categories: ["เสื้อ"],
    styles: ["minimal"],
    brands: ["Nike"],
    sizes: [{ category: "เสื้อ", values: ["M"] }],
  };
  render(<StyleProfileForm />);
  await ready();
  expect(group("สไตล์ที่ชอบ").getByText("minimal")).toBeInTheDocument();
  expect(group("สไตล์ที่ชอบ").queryByText("vintage")).not.toBeInTheDocument();
  expect(group("ขนาด: เสื้อ").getByText("M")).toBeInTheDocument();
  expect(
    group("ขนาด: รองเท้า").getByText("ยังไม่ได้เลือก"),
  ).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("เพิ่มไซซ์ในกลุ่ม เสื้อ"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /แสดงเพิ่มเติม/ }),
  ).not.toBeInTheDocument();
});
it("allows skipped setup and saves empty lists without selecting defaults", async () => {
  render(<StyleProfileForm />);
  expect(screen.getByText("กำลังโหลดความสนใจ...")).toBeInTheDocument();
  await ready();
  expect(
    group("หมวดสินค้าที่ชอบ").getByText("ยังไม่ได้เลือก"),
  ).toBeInTheDocument();
  await save();
  expect(saved).toEqual(EMPTY);
});
it("confirms multiple choices per field, then explicitly saves and reloads", async () => {
  const first = render(<StyleProfileForm />);
  await ready();
  choose("หมวดสินค้าที่ชอบ", ["เสื้อ", "รองเท้า"]);
  choose("สไตล์ที่ชอบ", ["minimal", "vintage"]);
  choose("แบรนด์ที่ชอบ", ["Nike", "Uniqlo"]);
  choose("ขนาด: เสื้อ", ["M", "L"]);
  choose("ขนาด: รองเท้า", ["40", "41"]);
  expect(
    apiFetch.mock.calls.filter(([, options]) => options?.method === "PATCH"),
  ).toHaveLength(0);
  expect(group("สไตล์ที่ชอบ").getByText("vintage")).toBeInTheDocument();
  await save();
  expect(saved).toEqual({
    categories: ["เสื้อ", "รองเท้า"],
    styles: ["minimal", "vintage"],
    brands: ["Nike", "Uniqlo"],
    sizes: [
      { category: "เสื้อ", values: ["M", "L"] },
      { category: "รองเท้า", values: ["40", "41"] },
    ],
    unassignedSizes: [],
  });
  first.unmount();
  render(<StyleProfileForm />);
  await ready();
  expect(group("ขนาด: เสื้อ").getByText("M")).toBeInTheDocument();
  const dialog = open("ขนาด: เสื้อ");
  expect(dialog.getByRole("checkbox", { name: "M" })).toBeChecked();
  fireEvent.click(dialog.getByRole("checkbox", { name: "M" }));
  fireEvent.click(dialog.getByRole("button", { name: "ยืนยัน" }));
  await save();
  expect(saved.sizes.find((item) => item.category === "เสื้อ").values).toEqual([
    "L",
  ]);
  expect(
    saved.sizes.find((item) => item.category === "รองเท้า").values,
  ).toEqual(["40", "41"]);
});
it("does not apply choices until confirmation, and cancel discards edits", async () => {
  saved = { ...EMPTY, styles: ["minimal"] };
  render(<StyleProfileForm />);
  await ready();
  const dialog = open("สไตล์ที่ชอบ");
  fireEvent.click(dialog.getByRole("checkbox", { name: "vintage" }));
  expect(group("สไตล์ที่ชอบ").queryByText("vintage")).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "ยกเลิก" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const reopened = open("สไตล์ที่ชอบ");
  expect(reopened.getByRole("checkbox", { name: "vintage" })).not.toBeChecked();
  expect(reopened.getByRole("checkbox", { name: "minimal" })).toBeChecked();
  fireEvent.click(reopened.getByRole("button", { name: "ยกเลิก" }));
  await save();
  expect(saved.styles).toEqual(["minimal"]);
});
for (const action of ["Escape", "close", "backdrop"])
  it(`closing by ${action} discards the popup draft and restores focus`, async () => {
    render(<StyleProfileForm />);
    await ready();
    const trigger = group("สไตล์ที่ชอบ").getByRole("button", {
      name: /เพิ่ม \/ แก้ไข/,
    });
    trigger.focus();
    const dialog = open("สไตล์ที่ชอบ");
    fireEvent.click(dialog.getByRole("checkbox", { name: "vintage" }));
    if (action === "Escape")
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    else if (action === "close")
      fireEvent.click(dialog.getByRole("button", { name: "ปิดหน้าต่าง" }));
    else fireEvent.mouseDown(screen.getByRole("dialog").parentElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(
      group("สไตล์ที่ชอบ").getByText("ยังไม่ได้เลือก"),
    ).toBeInTheDocument();
    expect(saved.styles).toEqual([]);
  });
it("shows all available options in the popup while keeping the main page compact", async () => {
  const previous = apiFetch.getMockImplementation();
  const styles = Array.from({ length: 12 }, (_, i) => `style ${i}`);
  apiFetch.mockImplementation((path, options) =>
    path === "/api/products/filters"
      ? Promise.resolve({ brands: [], styles, sizesByCategory: [] })
      : previous(path, options),
  );
  saved = { ...EMPTY, styles: styles.slice(4) };
  render(<StyleProfileForm />);
  await ready();
  expect(group("สไตล์ที่ชอบ").queryByText("style 0")).not.toBeInTheDocument();
  expect(group("สไตล์ที่ชอบ").getByText("style 11")).toBeInTheDocument();
  expect(group("สไตล์ที่ชอบ").getAllByText(/^style \d+$/)).toHaveLength(8);
  const dialog = open("สไตล์ที่ชอบ");
  expect(dialog.getAllByRole("checkbox")).toHaveLength(12);
  fireEvent.click(dialog.getByRole("button", { name: "ยกเลิก" }));
});
it("keeps saved choices missing from the catalog available and permits clearing them", async () => {
  saved = {
    ...EMPTY,
    styles: ["old style"],
    sizes: [{ category: "เสื้อ", values: ["3XL"] }],
  };
  render(<StyleProfileForm />);
  await ready();
  const dialog = open("สไตล์ที่ชอบ");
  expect(dialog.getByRole("checkbox", { name: "old style" })).toBeChecked();
  fireEvent.click(dialog.getByRole("checkbox", { name: "old style" }));
  fireEvent.click(dialog.getByRole("button", { name: "ยืนยัน" }));
  expect(group("สไตล์ที่ชอบ").getByText("ยังไม่ได้เลือก")).toBeInTheDocument();
  expect(group("ขนาด: เสื้อ").getByText("3XL")).toBeInTheDocument();
  await save();
  expect(saved.styles).toEqual([]);
});
it("includes default size choices in the popup even with no listed products", async () => {
  const previous = apiFetch.getMockImplementation();
  fetchCategories.mockResolvedValue([]);
  apiFetch.mockImplementation((path, options) =>
    path === "/api/products/filters"
      ? Promise.resolve({ brands: [], styles: [], sizesByCategory: [] })
      : previous(path, options),
  );
  render(<StyleProfileForm />);
  await ready();
  const clothes = open("ขนาด: เสื้อ");
  for (const value of ["XS", "S", "M", "L", "XL", "XXL"])
    expect(clothes.getByRole("checkbox", { name: value })).not.toBeChecked();
  fireEvent.click(clothes.getByRole("button", { name: "ยกเลิก" }));
  choose("ขนาด: เสื้อ", ["M"]);
  choose("ขนาด: รองเท้า", ["40"]);
  await save();
  expect(saved.categories).toEqual([]);
});
it("adds custom sizes inside the popup only, and cancellation never commits them", async () => {
  render(<StyleProfileForm />);
  await ready();
  let dialog = open("ขนาด: เสื้อ");
  fireEvent.change(dialog.getByLabelText("เพิ่มไซซ์ในกลุ่ม เสื้อ"), {
    target: { value: "4XL" },
  });
  fireEvent.keyDown(dialog.getByLabelText("เพิ่มไซซ์ในกลุ่ม เสื้อ"), {
    key: "Enter",
  });
  expect(dialog.getByRole("checkbox", { name: "4XL" })).toBeChecked();
  fireEvent.click(dialog.getByRole("button", { name: "ยกเลิก" }));
  expect(group("ขนาด: เสื้อ").queryByText("4XL")).not.toBeInTheDocument();
  dialog = open("ขนาด: เสื้อ");
  expect(
    dialog.queryByRole("checkbox", { name: "4XL" }),
  ).not.toBeInTheDocument();
  fireEvent.change(dialog.getByLabelText("เพิ่มไซซ์ในกลุ่ม เสื้อ"), {
    target: { value: "4XL" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "เพิ่มไซซ์ เสื้อ" }));
  fireEvent.click(dialog.getByRole("checkbox", { name: "4XL" }));
  expect(dialog.getByRole("checkbox", { name: "4XL" })).not.toBeChecked();
  fireEvent.click(dialog.getByRole("checkbox", { name: "4XL" }));
  fireEvent.click(dialog.getByRole("button", { name: "ยืนยัน" }));
  expect(group("ขนาด: เสื้อ").getByText("4XL")).toBeInTheDocument();
  await save();
  expect(saved.sizes).toEqual([{ category: "เสื้อ", values: ["4XL"] }]);
});
it("validates custom sizes and duplicate selections within the popup", async () => {
  render(<StyleProfileForm />);
  await ready();
  const dialog = open("ขนาด: เสื้อ");
  fireEvent.click(dialog.getByRole("button", { name: "เพิ่มไซซ์ เสื้อ" }));
  expect(
    dialog.getByText("กรอกไซซ์ 1–100 ตัวอักษร โดยไม่มีอักขระควบคุม"),
  ).toBeInTheDocument();
  fireEvent.click(dialog.getByRole("checkbox", { name: "M" }));
  fireEvent.change(dialog.getByLabelText("เพิ่มไซซ์ในกลุ่ม เสื้อ"), {
    target: { value: " M " },
  });
  fireEvent.click(dialog.getByRole("button", { name: "เพิ่มไซซ์ เสื้อ" }));
  expect(dialog.getByText("เลือกไซซ์นี้ไว้แล้ว")).toBeInTheDocument();
  expect(dialog.getByRole("checkbox", { name: "M" })).toBeChecked();
  fireEvent.click(dialog.getByRole("button", { name: "ยืนยัน" }));
});
it("adds bags from the type dropdown and saves its popup choices independently of favorite categories", async () => {
  const first = render(<StyleProfileForm />);
  await ready();
  addGroup("กระเป๋า");
  expect(
    [...screen.getByLabelText("ประเภทสินค้าที่ต้องการเพิ่ม").options].some(
      (option) => option.value === "กระเป๋า",
    ),
  ).toBe(false);
  const dialog = open("ขนาด: กระเป๋า");
  fireEvent.change(dialog.getByLabelText("เพิ่มไซซ์ในกลุ่ม กระเป๋า"), {
    target: { value: "S" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "เพิ่มไซซ์ กระเป๋า" }));
  fireEvent.click(dialog.getByRole("button", { name: "ยืนยัน" }));
  await save();
  expect(saved.categories).toEqual([]);
  expect(saved.sizes).toEqual([{ category: "กระเป๋า", values: ["S"] }]);
  first.unmount();
  render(<StyleProfileForm />);
  await ready();
  expect(group("ขนาด: กระเป๋า").getByText("S")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ลบกลุ่มขนาด กระเป๋า" }));
  await save();
  expect(saved.sizes).toEqual([]);
});
it("removing favorite categories does not remove sizes, and clear-all requires saving", async () => {
  saved = {
    ...EMPTY,
    categories: ["เสื้อ"],
    sizes: [{ category: "เสื้อ", values: ["M"] }],
  };
  render(<StyleProfileForm />);
  await ready();
  const dialog = open("หมวดสินค้าที่ชอบ");
  fireEvent.click(dialog.getByRole("checkbox", { name: "เสื้อ" }));
  fireEvent.click(dialog.getByRole("button", { name: "ยืนยัน" }));
  expect(group("ขนาด: เสื้อ").getByText("M")).toBeInTheDocument();
  await save();
  expect(saved.sizes).toEqual([{ category: "เสื้อ", values: ["M"] }]);
  fireEvent.click(screen.getByRole("button", { name: "ล้างความสนใจทั้งหมด" }));
  expect(saved.sizes).toHaveLength(1);
  await save();
  expect(saved).toEqual(EMPTY);
});
it("preserves unassigned legacy sizes until explicitly assigned or removed", async () => {
  saved = { ...EMPTY, unassignedSizes: ["M"] };
  render(<StyleProfileForm />);
  await ready();
  await save();
  expect(saved.unassignedSizes).toEqual(["M"]);
  fireEvent.change(screen.getByLabelText("หมวดของขนาดเดิม M"), {
    target: { value: "เสื้อ" },
  });
  expect(group("ขนาด: เสื้อ").getByText("M")).toBeInTheDocument();
  await save();
  expect(saved.unassignedSizes).toEqual([]);
});
it("keeps keyboard focus inside the selection popup", async () => {
  render(<StyleProfileForm />);
  await ready();
  const dialog = open("สไตล์ที่ชอบ");
  const closeButton = dialog.getByRole("button", { name: "ปิดหน้าต่าง" });
  const confirm = dialog.getByRole("button", { name: "ยืนยัน" });
  closeButton.focus();
  fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
  expect(confirm).toHaveFocus();
  fireEvent.keyDown(confirm, { key: "Tab" });
  expect(closeButton).toHaveFocus();
  fireEvent.click(closeButton);
});
for (const value of ["X".repeat(101), "M\u0007L"])
  it("rejects oversized or control-character custom sizes", async () => {
    render(<StyleProfileForm />);
    await ready();
    const dialog = open("ขนาด: เสื้อ");
    fireEvent.change(dialog.getByLabelText("เพิ่มไซซ์ในกลุ่ม เสื้อ"), {
      target: { value },
    });
    fireEvent.click(dialog.getByRole("button", { name: "เพิ่มไซซ์ เสื้อ" }));
    expect(
      dialog.getByText("กรอกไซซ์ 1–100 ตัวอักษร โดยไม่มีอักขระควบคุม"),
    ).toBeInTheDocument();
    expect(
      dialog.queryByRole("checkbox", { checked: true }),
    ).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "ยกเลิก" }));
  });
it("blocks setup when the catalog API lacks grouped sizes", async () => {
  const previous = apiFetch.getMockImplementation();
  apiFetch.mockImplementation((path, options) =>
    path === "/api/products/filters"
      ? Promise.resolve({ sizes: ["M"] })
      : previous(path, options),
  );
  render(<StyleProfileForm />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Product Service");
  expect(
    screen.queryByRole("button", { name: /บันทึกความสนใจ/ }),
  ).not.toBeInTheDocument();
});
it("load errors block writes and support retry", async () => {
  apiFetch.mockRejectedValueOnce(new Error("โหลดไม่ได้"));
  render(<StyleProfileForm />);
  expect(await screen.findByRole("alert")).toHaveTextContent("โหลดไม่ได้");
  expect(
    screen.queryByRole("button", { name: /บันทึกความสนใจ/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "โหลดความสนใจอีกครั้ง" }));
  await ready();
});
it("rejects old API shapes instead of silently clearing preferences", async () => {
  apiFetch.mockResolvedValueOnce({ stylePreference: "minimal" });
  render(<StyleProfileForm />);
  expect(await screen.findByRole("alert")).toHaveTextContent("รูปแบบข้อมูล");
});
it("save errors retain confirmed selections and allow retry", async () => {
  render(<StyleProfileForm />);
  await ready();
  choose("สไตล์ที่ชอบ", ["minimal"]);
  apiFetch.mockRejectedValueOnce(new Error("บันทึกไม่ได้"));
  fireEvent.click(screen.getByRole("button", { name: /บันทึกความสนใจ/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("บันทึกไม่ได้");
  expect(group("สไตล์ที่ชอบ").getByText("minimal")).toBeInTheDocument();
  await save();
  expect(saved.styles).toEqual(["minimal"]);
});
it("disables popup triggers and prevents duplicate writes while saving", async () => {
  render(<StyleProfileForm />);
  await ready();
  let resolve;
  apiFetch.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const button = screen.getByRole("button", { name: /บันทึกความสนใจ/ });
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(
    group("สไตล์ที่ชอบ").getByRole("button", { name: /เพิ่ม \/ แก้ไข/ }),
  ).toBeDisabled();
  fireEvent.click(button);
  expect(
    apiFetch.mock.calls.filter(([, options]) => options?.method === "PATCH"),
  ).toHaveLength(1);
  await act(async () => resolve(EMPTY));
});
