import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FaqSection from "./FaqSection";
import { apiFetch } from "../../../lib/api";
jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock(
  "../SupportCategorySelect",
  () =>
    function Category({ value, onChange }) {
      return (
        <select aria-label="หมวดหมู่" value={value} onChange={onChange}>
          <option value="OTHER">อื่น ๆ</option>
        </select>
      );
    },
);
jest.mock(
  "../../panel/ui/DropdownFilter",
  () =>
    function StatusFilter({ value, options, onChange }) {
      return (
        <select
          aria-label="สถานะบทความ"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    },
);

beforeEach(() => apiFetch.mockReset());

test("FAQ management can reach articles after page one and resets pagination when filtered", async () => {
  apiFetch.mockImplementation((path) => {
    const page = Number(new URL(path, "http://local").searchParams.get("page"));
    return Promise.resolve({
      items: [
        {
          id: `article-${page}`,
          title: `บทความหน้า ${page}`,
          category: "NEW_CATEGORY",
          status: "DRAFT",
        },
      ],
      totalPages: 5,
    });
  });
  render(<FaqSection token="staff-token" />);
  await screen.findByText("บทความหน้า 1");
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await screen.findByText("บทความหน้า 2");
  expect(apiFetch.mock.calls.some(([path]) => path.includes("page=2"))).toBe(
    true,
  );
  fireEvent.change(screen.getByLabelText("สถานะบทความ"), {
    target: { value: "PUBLISHED" },
  });
  await screen.findByText("บทความหน้า 1");
  expect(
    apiFetch.mock.calls.some(
      ([path]) => path.includes("page=1") && path.includes("status=PUBLISHED"),
    ),
  ).toBe(true);
});

test("failed FAQ loads show a retry without pretending the database is empty", async () => {
  apiFetch.mockRejectedValueOnce(new Error("service unavailable"));
  apiFetch.mockResolvedValue({ items: [], totalPages: 1 });
  render(<FaqSection token="staff-token" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "service unavailable",
  );
  expect(screen.queryByText("ยังไม่มีบทความในหมวดนี้")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(
    await screen.findByText("ยังไม่มีบทความในหมวดนี้"),
  ).toBeInTheDocument();
});

test("edits an existing FAQ as a revision and allows publishing unpublished changes", async () => {
  const article = {
    id: "a1",
    title: "หัวข้อเดิม",
    body: "เนื้อหาเดิม",
    category: "OTHER",
    status: "PUBLISHED",
    hasUnpublishedChanges: true,
  };
  apiFetch.mockImplementation((path) =>
    Promise.resolve(
      path.includes("manage?") ? { items: [article], totalPages: 1 } : article,
    ),
  );
  render(<FaqSection token="staff-token" />);
  await screen.findByText("หัวข้อเดิม");
  expect(
    screen.getByRole("button", { name: "เผยแพร่บทความนี้" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "แก้ไข" }));
  expect(screen.getByLabelText("เนื้อหาบทความ")).toHaveValue("เนื้อหาเดิม");
  fireEvent.change(screen.getByLabelText("หัวข้อบทความ"), {
    target: { value: "หัวข้อใหม่" },
  });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกเป็นฉบับร่าง" }));
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/support/help/a1/revisions",
      expect.objectContaining({
        method: "POST",
        body: { title: "หัวข้อใหม่", body: "เนื้อหาเดิม", category: "OTHER" },
      }),
    ),
  );
});

test("deleting FAQ requires confirmation and failed deletion keeps the article", async () => {
  const article = { id: "a1", title: "บทความที่จะลบ", status: "DRAFT" };
  apiFetch.mockImplementation((path, options) =>
    options?.method === "DELETE"
      ? Promise.reject(new Error("ลบไม่สำเร็จ"))
      : Promise.resolve({ items: [article], totalPages: 1 }),
  );
  render(<FaqSection token="staff-token" />);
  await screen.findByText(article.title);
  fireEvent.click(screen.getByRole("button", { name: "ลบ" }));
  expect(
    apiFetch.mock.calls.some(([, options]) => options?.method === "DELETE"),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบ" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ลบไม่สำเร็จ");
  expect(screen.getByText(article.title)).toBeInTheDocument();
});

test("successful deletion refreshes the list and removes the FAQ", async () => {
  const article = { id: "a1", title: "บทความที่จะลบ", status: "DRAFT" };
  let deleted = false;
  apiFetch.mockImplementation((path, options) => {
    if (options?.method === "DELETE") {
      deleted = true;
      return Promise.resolve(null);
    }
    return Promise.resolve({ items: deleted ? [] : [article], totalPages: 1 });
  });
  render(<FaqSection token="staff-token" />);
  await screen.findByText(article.title);
  fireEvent.click(screen.getByRole("button", { name: "ลบ" }));
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบ" }));
  await screen.findByText("ยังไม่มีบทความในหมวดนี้");
  expect(screen.queryByText(article.title)).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
