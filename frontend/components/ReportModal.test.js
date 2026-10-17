import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReportModal from "./ReportModal";
import { apiFetch, createReportWithEvidence } from "../lib/api";
import { getAccessToken } from "../lib/auth";

jest.mock("../lib/api", () => ({
  apiFetch: jest.fn(),
  createReportWithEvidence: jest.fn(),
}));

function pickCategory(label) {
  fireEvent.click(screen.getByRole("button", { name: "เลือกประเภทปัญหา" }));
  fireEvent.click(screen.getByRole("radio", { name: label }));
}

jest.mock("../lib/auth", () => ({
  getAccessToken: jest.fn(),
}));

describe("ReportModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAccessToken.mockReturnValue("mock-token");
    apiFetch.mockImplementation(async (url) => {
      if (url.includes("/pending-check")) {
        return { hasPendingReport: false };
      }
      return { id: "rep-default" };
    });
    createReportWithEvidence.mockResolvedValue({ id: "rep-default" });
  });

  it("does not render when open is false", () => {
    const { container } = render(
      <ReportModal open={false} onClose={jest.fn()} targetId="user-1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("submits general problem report with user reason", async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.includes("/pending-check")) {
        return { hasPendingReport: false };
      }
      return { id: "rep-1" };
    });
    const handleClose = jest.fn();

    render(
      <ReportModal
        open={true}
        onClose={handleClose}
        targetId="user-1"
        targetLabel="ร้านค้า A"
        productId="prod-1"
        productLabel="สินค้า A"
      />,
    );

    expect(screen.getByText("รายงานปัญหา")).toBeInTheDocument();
    expect(screen.getByText(/ร้านค้า A/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ส่งรายงาน" })).toBeEnabled();
    });

    const textarea = screen.getByPlaceholderText("อธิบายปัญหาที่พบ...");
    fireEvent.change(textarea, { target: { value: "สินค้าไม่ตรงปก มีตำหนิเยอะมาก" } });
    pickCategory("ข้อมูลร้านค้าหรือสินค้าไม่ตรงความจริง");

    fireEvent.click(screen.getByRole("button", { name: "ส่งรายงาน" }));

    await waitFor(() => {
      expect(createReportWithEvidence).toHaveBeenCalledWith(
        {
          targetId: "user-1",
          productId: "prod-1",
          reviewId: undefined,
          category: "MISLEADING_INFORMATION",
          reason: "สินค้าไม่ตรงปก มีตำหนิเยอะมาก",
          file: null,
        },
        "mock-token",
      );
    });

    expect(screen.getByText("ส่งรายงานเรียบร้อยแล้ว")).toBeInTheDocument();
  });

  it("renders review report mode with categories and quote preview", async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.includes("/pending-check")) {
        return { hasPendingReport: false };
      }
      return { id: "rep-2" };
    });

    render(
      <ReportModal
        open={true}
        onClose={jest.fn()}
        title="รายงานรีวิวที่ไม่เหมาะสม"
        targetId="reviewer-123"
        productId="prod-1"
        reviewId="rev-456"
        reviewComment="ร้านโกง ส่งของปลอมมา อย่าซื้อ!"
      />,
    );

    expect(screen.getByText("รายงานรีวิวที่ไม่เหมาะสม")).toBeInTheDocument();
    expect(screen.getByText("เนื้อหารีวิวที่รายงาน:")).toBeInTheDocument();
    expect(screen.getByText(/ร้านโกง ส่งของปลอมมา อย่าซื้อ!/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ส่งรายงาน" })).toBeEnabled();
    });

    // Verify categories are rendered
    expect(screen.getByRole("button", { name: "รีวิวปั่น / สแปม / ปั๊มรีวิว" })).toBeInTheDocument();
    const fakeInfoBtn = screen.getByRole("button", { name: "รีวิวเท็จ / ข้อมูลไม่ตรงกับความจริง" });
    expect(fakeInfoBtn).toBeInTheDocument();

    // Change category
    fireEvent.click(fakeInfoBtn);

    const textarea = screen.getByPlaceholderText(/เช่น มีพฤติกรรมรีวิวปั่น/);
    fireEvent.change(textarea, { target: { value: "ผู้ซื้อไม่ได้สั่งจริง และสร้างข้อความเท็จ" } });

    fireEvent.click(screen.getByRole("button", { name: "ส่งรายงาน" }));

    await waitFor(() => {
      expect(createReportWithEvidence).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: "reviewer-123",
          productId: "prod-1",
          reviewId: "rev-456",
          reason: expect.stringContaining("[รายงานรีวิว #rev-456] [รีวิวเท็จ / ข้อมูลไม่ตรงกับความจริง] ผู้ซื้อไม่ได้สั่งจริง"),
        }),
        "mock-token",
      );
    });

    expect(screen.getByText("ส่งรายงานเรียบร้อยแล้ว")).toBeInTheDocument();
  });

  it("shows warning and disables submission when item is already reported and pending", async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.includes("/pending-check")) {
        return {
          hasPendingReport: true,
          message: "คุณได้รายงานสินค้านี้ไปแล้ว และอยู่ระหว่างรอผลการตัดสินจากผู้ดูแลระบบ",
        };
      }
      return {};
    });

    render(
      <ReportModal
        open={true}
        onClose={jest.fn()}
        targetId="user-1"
        productId="prod-1"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("คุณได้รายงานสินค้านี้ไปแล้ว และอยู่ระหว่างรอผลการตัดสินจากผู้ดูแลระบบ"),
      ).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: "อยู่ระหว่างตรวจสอบ" });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByPlaceholderText("รายงานนี้อยู่ระหว่างการตรวจสอบโดยทีมงาน...")).toBeDisabled();
  });

  it("displays error message if backend returns duplicate conflict error", async () => {
    apiFetch.mockImplementation(async (url, opts) => {
      if (url.includes("/pending-check")) {
        return { hasPendingReport: false };
      }
      if (opts?.method === "POST") {
        throw new Error("คุณได้รายงานสินค้านี้ไปแล้ว และอยู่ระหว่างรอผลการตัดสินจากผู้ดูแลระบบ");
      }
      return {};
    });

    render(
      <ReportModal
        open={true}
        onClose={jest.fn()}
        targetId="user-1"
        productId="prod-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ส่งรายงาน" })).toBeEnabled();
    });

    const textarea = screen.getByPlaceholderText("อธิบายปัญหาที่พบ...");
    fireEvent.change(textarea, { target: { value: "สินค้ามีปัญหา" } });
    pickCategory("ข้อมูลร้านค้าหรือสินค้าไม่ตรงความจริง");
    createReportWithEvidence.mockRejectedValue(
      new Error("คุณได้รายงานสินค้านี้ไปแล้ว และอยู่ระหว่างรอผลการตัดสินจากผู้ดูแลระบบ"),
    );

    fireEvent.click(screen.getByRole("button", { name: "ส่งรายงาน" }));

    await waitFor(() => {
      expect(
        screen.getByText("คุณได้รายงานสินค้านี้ไปแล้ว และอยู่ระหว่างรอผลการตัดสินจากผู้ดูแลระบบ"),
      ).toBeInTheDocument();
    });
  });

  it("requires a category and sends the selected image with a seller report", async () => {
    createReportWithEvidence.mockResolvedValue({ id: "report-1" });
    render(<ReportModal open onClose={() => {}} targetId="seller-1" targetLabel="ร้านทดสอบ" />);
    const file = new File(["image bytes"], "proof.png", { type: "image/png" });
    fireEvent.change(document.body.querySelector('input[type="file"]'), { target: { files: [file] } });
    fireEvent.change(screen.getByPlaceholderText("อธิบายปัญหาที่พบ..."), { target: { value: "สินค้าผิดรายละเอียด" } });
    fireEvent.click(screen.getByRole("button", { name: "เลือกประเภทปัญหา" }));
    expect(screen.queryByRole("radio", { name: "เลือกประเภทปัญหา" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "ข้อมูลร้านค้าหรือสินค้าไม่ตรงความจริง" }));
    fireEvent.click(await screen.findByRole("button", { name: "ส่งรายงาน" }));
    await waitFor(() => expect(createReportWithEvidence).toHaveBeenCalledWith({
      targetId: "seller-1", productId: undefined, reviewId: undefined, category: "MISLEADING_INFORMATION", reason: "สินค้าผิดรายละเอียด", file,
    }, "mock-token"));
    expect(await screen.findByText("ส่งรายงานเรียบร้อยแล้ว")).toBeInTheDocument();
  });
});
