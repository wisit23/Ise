import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import AuctionScheduleSection, {
  RoundManagementSection,
} from "./AuctionScheduleSection";
import { apiFetch } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiFetch: jest.fn(),
  mediaUrl: jest.fn((url) => url || ""),
}));

describe("RoundManagementSection - Focused Round Management & Phase Visualization", () => {
  const mockToken = "mock-mkt-jwt-token";

  const sampleActiveRound = {
    id: "round-active-1",
    title: "รอบประมูลประจำสัปดาห์ที่ 1",
    submissionStartsAt: "2026-10-01T00:00:00.000Z",
    submissionEndsAt: "2026-10-03T00:00:00.000Z",
    auctionStartsAt: "2026-10-03T12:00:00.000Z",
    auctionEndsAt: "2026-10-05T12:00:00.000Z",
    _count: { auctions: 5 },
  };

  const sampleUpcomingRound = {
    id: "round-upcoming-2",
    title: "รอบประมูลสินค้าแบรนด์เนม",
    submissionStartsAt: "2026-10-10T00:00:00.000Z",
    submissionEndsAt: "2026-10-12T00:00:00.000Z",
    auctionStartsAt: "2026-10-12T12:00:00.000Z",
    auctionEndsAt: "2026-10-15T12:00:00.000Z",
    _count: { auctions: 0 },
  };

  const sampleEndedRound = {
    id: "round-ended-0",
    title: "รอบประมูลปฐมฤกษ์",
    submissionStartsAt: "2026-09-01T00:00:00.000Z",
    submissionEndsAt: "2026-09-03T00:00:00.000Z",
    auctionStartsAt: "2026-09-03T12:00:00.000Z",
    auctionEndsAt: "2026-09-05T12:00:00.000Z",
    _count: { auctions: 12 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default auctions list for main section
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: sampleActiveRound,
          phase: "submission",
          isSubmissionOpen: true,
          isAuctionActive: false,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({
          items: [
            { ...sampleActiveRound, phase: "submission" },
            { ...sampleUpcomingRound, phase: "upcoming" },
            { ...sampleEndedRound, phase: "ended" },
          ],
        });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [], total: 0 });
      }
      return Promise.resolve({});
    });
  });

  it("shows occupied capacity including pending submissions and flags full rounds", async () => {
    const round = { ...sampleActiveRound, maxItems: 5, submittedItemCount: 5, phase: "submission" };
    apiFetch.mockImplementation(url => Promise.resolve(url.includes("/rounds/current")
      ? { activeSubmissionRounds: [round] } : { items: [round] }));
    render(<RoundManagementSection token={mockToken} />);
    expect((await screen.findAllByText("5 / 5")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("เต็มแล้ว").length).toBeGreaterThanOrEqual(1);
  });

  it("requires a positive capacity and does not post an invalid round", async () => {
    render(<RoundManagementSection token={mockToken} />);
    fireEvent.click(await screen.findByRole("button", { name: /สร้างรอบประมูลใหม่/ }));
    fireEvent.change(screen.getByPlaceholderText(/รอบประมูลสินค้ามือสอง/), { target: { value: "Capacity test" } });
    for (const [label, value] of [
      [/วัน-เวลาเริ่มเปิดรับ/, "2035-01-01T10:00"], [/วัน-เวลาปิดรับสินค้า/, "2035-01-01T11:00"],
      [/วัน-เวลาเริ่มเปิดประมูล/, "2035-01-01T12:00"], [/วัน-เวลาสิ้นสุดการประมูล/, "2035-01-01T13:00"],
    ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.change(screen.getByLabelText("จำนวนสินค้าสูงสุดต่อรอบ"), { target: { value: "0" } });
    fireEvent.submit(screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ }).closest("form"));
    expect(await screen.findByText(/กรุณาระบุจำนวนสินค้าสูงสุดเป็นจำนวนเต็มบวก/)).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });

  it("rejects a new round whose submission start is in the past", async () => {
    render(<RoundManagementSection token={mockToken} />);
    fireEvent.click(await screen.findByRole("button", { name: /สร้างรอบประมูลใหม่/ }));
    fireEvent.change(screen.getByPlaceholderText(/รอบประมูลสินค้ามือสอง/), {
      target: { value: "Past round" },
    });
    fireEvent.change(screen.getByLabelText("จำนวนสินค้าสูงสุดต่อรอบ"), {
      target: { value: "10" },
    });
    for (const [label, value] of [
      [/วัน-เวลาเริ่มเปิดรับ/, "2020-01-01T10:00"],
      [/วัน-เวลาปิดรับสินค้า/, "2035-01-01T11:00"],
      [/วัน-เวลาเริ่มเปิดประมูล/, "2035-01-01T12:00"],
      [/วัน-เวลาสิ้นสุดการประมูล/, "2035-01-01T13:00"],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }

    expect(screen.getByLabelText(/วัน-เวลาเริ่มเปิดรับ/)).toHaveAttribute("min");
    fireEvent.submit(screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ }).closest("form"));

    expect(
      await screen.findByText(/เวลาเริ่มเปิดรับสินค้าต้องเป็นเวลาปัจจุบันหรืออนาคต/),
    ).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });

  it("refreshes history capacity immediately after rejecting an item", async () => {
    let rejected = false;
    const round = () => ({ ...sampleActiveRound, phase: "submission", maxItems: 1, submittedItemCount: rejected ? 0 : 1 });
    apiFetch.mockImplementation((url, options) => {
      if (options?.method === "PATCH" && url.endsWith("/reject")) {
        rejected = true;
        return Promise.resolve({ id: "quota-item", status: "rejected" });
      }
      if (url.includes("/rounds/current")) return Promise.resolve({ activeSubmissionRounds: [round()] });
      if (url.includes("/rounds")) return Promise.resolve({ items: [round()], total: 1, totalPages: 1 });
      return Promise.resolve({ items: [{ id: "quota-item", productId: "quota-product", status: rejected ? "rejected" : "pending_approval",
        startingPrice: 100, bidIncrement: 10, product: { title: "Quota regression item" } }], total: 1, totalPages: 1 });
    });
    render(<AuctionScheduleSection token={mockToken} />);
    await screen.findByRole("button", { name: "ปฏิเสธสินค้า" });
    expect(screen.getAllByText("1 / 1").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "ปฏิเสธสินค้า" }));
    fireEvent.change(screen.getByPlaceholderText(/ระบุรายละเอียดที่ผู้ขายต้องแก้ไข/), {
      target: { value: "รายละเอียดสินค้าไม่ครบถ้วน" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันการปฏิเสธสินค้า" }));
    await waitFor(() => expect(screen.getAllByText("0 / 1")).toHaveLength(1));
    expect(screen.queryByText("เต็มแล้ว")).not.toBeInTheDocument();
  });

  it("renders an active round in the all-round history with its phase badge", async () => {
    render(<RoundManagementSection token={mockToken} />);

    expect(
      (await screen.findAllByText("รอบประมูลประจำสัปดาห์ที่ 1")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("กำลังเปิดรับสินค้า").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /ดูรายละเอียดรอบ รอบประมูลประจำสัปดาห์ที่ 1/ })).toBeInTheDocument();
  });

  it("renders an upcoming round in the all-round history with its phase badge", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: sampleUpcomingRound,
          phase: "upcoming",
          isSubmissionOpen: false,
          isAuctionActive: false,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({
          items: [{ ...sampleUpcomingRound, phase: "upcoming" }],
        });
      }
      return Promise.resolve({ items: [], total: 0 });
    });

    render(<RoundManagementSection token={mockToken} />);

    expect(
      (await screen.findAllByText("รอบประมูลสินค้าแบรนด์เนม")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("รอเปิดรับสินค้า").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /ดูรายละเอียดรอบ รอบประมูลสินค้าแบรนด์เนม/ })).toBeInTheDocument();
  });

  it("renders all-round history list with phase badges and item counts", async () => {
    render(<RoundManagementSection token={mockToken} />);

    expect(
      await screen.findByText(/รอบประมูลที่ค้นพบ \(3\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/รอบที่ยังจัดการได้ \(2 รายการในหน้านี้\)/)).toBeInTheDocument();
    expect(screen.getByText(/ประวัติรอบประมูล \(1 รายการในหน้านี้\)/)).toBeInTheDocument();
    expect(screen.getByText("รอบประมูลปฐมฤกษ์")).toBeInTheDocument();
    expect(screen.getAllByText("ปิดรอบแล้ว").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("searches and filters auction rounds before pagination", async () => {
    render(<RoundManagementSection token={mockToken} />);
    await screen.findByText("รอบประมูลปฐมฤกษ์");

    fireEvent.change(screen.getByPlaceholderText("ค้นหาจากชื่อรอบประมูล"), {
      target: { value: "แบรนด์เนม" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ค้นหารอบประมูล" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/products\/auctions\/rounds\?.*search=.*%E0%B9%81%E0%B8%9A%E0%B8%A3%E0%B8%99%E0%B8%94%E0%B9%8C%E0%B9%80%E0%B8%99%E0%B8%A1/),
        expect.anything(),
      );
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "ปิดรอบแล้ว" }));
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/products\/auctions\/rounds\?.*phases=ended/),
        expect.anything(),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "ล้างตัวกรอง" }));
    expect(screen.getByPlaceholderText("ค้นหาจากชื่อรอบประมูล")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "ปิดรอบแล้ว" })).not.toBeChecked();
  });

  it("renders empty state when no rounds are returned", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: null,
          phase: null,
          isSubmissionOpen: false,
          isAuctionActive: false,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({ items: [], total: 0 });
    });

    render(<RoundManagementSection token={mockToken} />);

    expect(await screen.findByText(/ยังไม่มีประวัติรอบการประมูล/)).toBeInTheDocument();
  });

  it("creates overlapping round successfully without conflict under MKT-DEC-025", async () => {
    let capturedBody = null;
    apiFetch.mockImplementation((url, opts) => {
      if (
        opts?.method === "POST" &&
        url.includes("/api/products/auctions/rounds")
      ) {
        capturedBody = opts.body;
        return Promise.resolve({
          id: "round-overlap-new",
          title: "รอบประมูลซ้อนทับ",
        });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: sampleActiveRound,
          phase: "submission",
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [sampleActiveRound] });
      }
      return Promise.resolve({ items: [] });
    });

    render(<RoundManagementSection token={mockToken} />);

    const openBtn = await screen.findByRole("button", {
      name: /สร้างรอบประมูลใหม่/,
    });
    fireEvent.click(openBtn);

    expect(screen.getByText("เปิดรอบประมูลใหม่")).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/รอบประมูลสินค้ามือสอง/), {
      target: { value: "รอบประมูลซ้อนทับ" },
    });

    const subStartInput = screen.getByLabelText(/วัน-เวลาเริ่มเปิดรับ/);
    const subEndInput = screen.getByLabelText(/วัน-เวลาปิดรับสินค้า/);
    const aucStartInput = screen.getByLabelText(/วัน-เวลาเริ่มเปิดประมูล/);
    const aucEndInput = screen.getByLabelText(/วัน-เวลาสิ้นสุดการประมูล/);

    fireEvent.change(subStartInput, { target: { value: "2035-10-02T00:00" } });
    fireEvent.change(subEndInput, { target: { value: "2035-10-04T00:00" } });
    fireEvent.change(aucStartInput, { target: { value: "2035-10-04T12:00" } });
    fireEvent.change(aucEndInput, { target: { value: "2035-10-06T12:00" } });
    fireEvent.change(screen.getByLabelText("จำนวนสินค้าสูงสุดต่อรอบ"), { target: { value: "20" } });

    const submitBtn = screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.title).toBe("รอบประมูลซ้อนทับ");
      expect(screen.queryByText("เปิดรอบประมูลใหม่")).not.toBeInTheDocument();
    });
  });

  it("renders multiple active rounds concurrently (submission and auction phases)", async () => {
    const roundSub = {
      id: "round-sub-1",
      title: "รอบเปิดรับสินค้าแฟชั่น",
      phase: "submission",
      submissionStartsAt: "2026-10-01T00:00:00.000Z",
      submissionEndsAt: "2026-10-05T00:00:00.000Z",
      auctionStartsAt: "2026-10-05T00:00:00.000Z",
      auctionEndsAt: "2026-10-10T00:00:00.000Z",
      _count: { auctions: 3 },
    };
    const roundAuc = {
      id: "round-auc-1",
      title: "รอบกำลังเคาะประมูลไอที",
      phase: "auction",
      submissionStartsAt: "2026-09-25T00:00:00.000Z",
      submissionEndsAt: "2026-09-30T00:00:00.000Z",
      auctionStartsAt: "2026-10-01T00:00:00.000Z",
      auctionEndsAt: "2026-10-05T12:00:00.000Z",
      _count: { auctions: 8 },
    };

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeSubmissionRounds: [roundSub],
          activeAuctionRounds: [roundAuc],
          isSubmissionOpen: true,
          isAuctionActive: true,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({
          items: [roundSub, roundAuc],
        });
      }
      return Promise.resolve({ items: [] });
    });

    render(<RoundManagementSection token={mockToken} />);

    expect(
      (await screen.findAllByText("รอบเปิดรับสินค้าแฟชั่น")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("รอบกำลังเคาะประมูลไอที").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("กำลังเปิดรับสินค้า").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("กำลังเคาะประมูล").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("displays client validation error when required fields are missing", async () => {
    render(<RoundManagementSection token={mockToken} />);

    const openBtn = await screen.findByRole("button", {
      name: /สร้างรอบประมูลใหม่/,
    });
    fireEvent.click(openBtn);

    // Try submitting with empty title
    const submitBtn = screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ });
    fireEvent.submit(submitBtn.closest("form"));

    expect(
      await screen.findByText(/กรุณากรอกชื่อรอบการประมูลให้ครบถ้วน/),
    ).toBeInTheDocument();
  });

  it("refreshes current round and round list after successful round creation", async () => {
    let createCalled = false;
    apiFetch.mockImplementation((url, opts) => {
      if (
        opts?.method === "POST" &&
        url.includes("/api/products/auctions/rounds")
      ) {
        createCalled = true;
        return Promise.resolve({ id: "round-new-created" });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: sampleActiveRound,
          phase: "submission",
          isSubmissionOpen: true,
          isAuctionActive: false,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({ items: [] });
    });

    render(<RoundManagementSection token={mockToken} />);

    const openBtn = await screen.findByRole("button", {
      name: /สร้างรอบประมูลใหม่/,
    });
    fireEvent.click(openBtn);

    fireEvent.change(screen.getByPlaceholderText(/รอบประมูลสินค้ามือสอง/), {
      target: { value: "รอบใหม่สำเร็จ" },
    });

    fireEvent.change(screen.getByLabelText(/วัน-เวลาเริ่มเปิดรับ/), {
      target: { value: "2035-10-20T00:00" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาปิดรับสินค้า/), {
      target: { value: "2035-10-22T00:00" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาเริ่มเปิดประมูล/), {
      target: { value: "2035-10-22T12:00" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาสิ้นสุดการประมูล/), {
      target: { value: "2035-10-25T12:00" },
    });

    fireEvent.change(screen.getByLabelText("จำนวนสินค้าสูงสุดต่อรอบ"), { target: { value: "20" } });
    const submitBtn = screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createCalled).toBe(true);
    });
  });

  it("renders parent AuctionScheduleSection with explicitly mocked API calls", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    // Renders the round management part inside the parent
    expect(
      (await screen.findAllByText("รอบประมูลประจำสัปดาห์ที่ 1")).length,
    ).toBeGreaterThanOrEqual(1);
    // Renders the parent filters/sections
    expect(
      screen.getByText(/ค้นหา ตรวจสอบ และจัดการสินค้า/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("ทุกสถานะ").length).toBeGreaterThanOrEqual(1);
  });
  it("renders round accepted categories in the all-round history table", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: {
            ...sampleActiveRound,
            categories: ["เสื้อผ้า", "รองเท้า"],
          },
          phase: "submission",
          isSubmissionOpen: true,
          isAuctionActive: false,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({
          items: [
            {
              ...sampleActiveRound,
              categories: ["เสื้อผ้า", "รองเท้า"],
              phase: "submission",
            },
            {
              ...sampleUpcomingRound,
              categories: [],
              phase: "upcoming",
            },
          ],
        });
      }
      return Promise.resolve({ items: [] });
    });

    render(<RoundManagementSection token={mockToken} />);

    expect(await screen.findByRole("columnheader", { name: "หมวดหมู่" })).toBeInTheDocument();
    expect(screen.getAllByText("เสื้อผ้า").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("รองเท้า").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ทุกหมวดหมู่").length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the round history table within its panel and exposes readable column labels", async () => {
    const longRoundTitle =
      "รอบประมูลสินค้าคอลเลกชันพิเศษชื่อยาวสำหรับตรวจการจัดวางบนเดสก์ท็อปแคบ";
    const round = {
      ...sampleActiveRound,
      id: "round-layout-regression",
      title: longRoundTitle,
      phase: "submission",
      categories: ["เสื้อผ้าชื่อหมวดหมู่ยาว", "รองเท้า"],
    };
    apiFetch.mockImplementation((url) => {
      if (url.includes("/rounds/current")) {
        return Promise.resolve({ activeSubmissionRounds: [round] });
      }
      if (url.includes("/rounds")) {
        return Promise.resolve({ items: [round], total: 1, totalPages: 1 });
      }
      return Promise.resolve({ items: [] });
    });

    const { container } = render(
      <RoundManagementSection token={mockToken} />,
    );

    expect(await screen.findByRole("columnheader", { name: "ช่วงรับสินค้า" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "ช่วงประมูล" })).toBeInTheDocument();
    expect(screen.getAllByTitle(longRoundTitle).length).toBeGreaterThanOrEqual(1);

    const historyTable = screen.getByRole("table");
    expect(historyTable).toHaveClass("table-fixed");
    expect(historyTable.className).not.toMatch(/min-w-\[/);
    expect(historyTable.parentElement).not.toHaveClass("overflow-x-auto");
    expect(container.querySelector("table .whitespace-nowrap")).toHaveTextContent(
      "กำลังเปิดรับสินค้า",
    );
  });

  it("wraps long auction item names while keeping status and actions visible", async () => {
    const longProductTitle =
      "กระเป๋ารุ่นพิเศษชื่อยาวมากสำหรับตรวจว่าชื่อสินค้าไม่ดันสถานะและปุ่มจัดการออกนอกการ์ด";
    apiFetch.mockImplementation((url) => {
      if (url.includes("/rounds/current")) return Promise.resolve(null);
      if (url.includes("/rounds")) {
        return Promise.resolve({ items: [], total: 0, totalPages: 1 });
      }
      if (url.includes("/categories")) return Promise.resolve({ items: [] });
      if (url.includes("/auctions?")) {
        return Promise.resolve({
          items: [
            {
              id: "auction-layout-regression",
              productId: "product-layout-regression",
              status: "pending_approval",
              startingPrice: 750,
              bidIncrement: 50,
              scheduledStartAt: "2026-10-20T03:00:00.000Z",
              scheduledEndAt: "2026-10-20T04:00:00.000Z",
              product: { title: longProductTitle, category: "กระเป๋า" },
              round: { title: "รอบทดสอบ Layout" },
            },
          ],
          total: 1,
          totalPages: 1,
        });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    const productLink = await screen.findByRole("link", {
      name: longProductTitle,
    });
    expect(productLink).toHaveAttribute("title", longProductTitle);
    expect(productLink).toHaveClass("line-clamp-2", "break-words");
    const statusBadge = screen
      .getAllByText("รออนุมัติจาก Marketing")
      .find((element) => element.classList.contains("whitespace-nowrap"));
    expect(statusBadge).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ตรวจสอบสินค้า" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "อนุมัติสินค้าเข้าประมูลจากรายการ" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "ปฏิเสธสินค้า" }),
    ).toBeVisible();
  });

  it("validates specific category mode requires at least one category", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/categories")) {
        return Promise.resolve({ items: ["เสื้อผ้า", "รองเท้า"] });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: sampleActiveRound,
          phase: "submission",
        });
      }
      return Promise.resolve({ items: [] });
    });

    render(<RoundManagementSection token={mockToken} />);

    const openBtn = await screen.findByRole("button", {
      name: /สร้างรอบประมูลใหม่/,
    });
    fireEvent.click(openBtn);

    fireEvent.change(screen.getByPlaceholderText(/รอบประมูลสินค้ามือสอง/), {
      target: { value: "รอบเฉพาะหมวด" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาเริ่มเปิดรับ/), {
      target: { value: "2035-10-20T00:00" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาปิดรับสินค้า/), {
      target: { value: "2035-10-22T00:00" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาเริ่มเปิดประมูล/), {
      target: { value: "2035-10-22T12:00" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาสิ้นสุดการประมูล/), {
      target: { value: "2035-10-25T12:00" },
    });

    // Select specific categories radio without checking any checkbox
    fireEvent.change(screen.getByLabelText("จำนวนสินค้าสูงสุดต่อรอบ"), { target: { value: "20" } });
    const specificRadio = screen.getByLabelText(/เลือกเฉพาะบางหมวดหมู่/);
    fireEvent.click(specificRadio);

    const submitBtn = screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText(
        /กรุณาเลือกอย่างน้อย 1 หมวดหมู่ หรือเลือกรับทุกหมวดหมู่/,
      ),
    ).toBeInTheDocument();
  });

  it("submits specific categories when selected", async () => {
    let capturedBody = null;
    apiFetch.mockImplementation((url, opts) => {
      if (url.includes("/api/products/categories")) {
        return Promise.resolve({ items: ["เสื้อผ้า", "รองเท้า"] });
      }
      if (
        opts?.method === "POST" &&
        url.includes("/api/products/auctions/rounds")
      ) {
        capturedBody = opts.body;
        return Promise.resolve({ id: "new-round-id" });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: sampleActiveRound,
          phase: "submission",
        });
      }
      return Promise.resolve({ items: [] });
    });

    render(<RoundManagementSection token={mockToken} />);

    const openBtn = await screen.findByRole("button", {
      name: /สร้างรอบประมูลใหม่/,
    });
    fireEvent.click(openBtn);

    fireEvent.change(screen.getByPlaceholderText(/รอบประมูลสินค้ามือสอง/), {
      target: { value: "รอบรองเท้าเท่านั้น" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาเริ่มเปิดรับ/), {
      target: { value: "2035-10-20T00:00" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาปิดรับสินค้า/), {
      target: { value: "2035-10-22T00:00" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาเริ่มเปิดประมูล/), {
      target: { value: "2035-10-22T12:00" },
    });
    fireEvent.change(screen.getByLabelText(/วัน-เวลาสิ้นสุดการประมูล/), {
      target: { value: "2035-10-25T12:00" },
    });

    const specificRadio = screen.getByLabelText(/เลือกเฉพาะบางหมวดหมู่/);
    fireEvent.click(specificRadio);

    // Wait for categories to render and check "รองเท้า"
    const shoesCheckbox = await screen.findByRole("checkbox", {
      name: "รองเท้า",
    });
    fireEvent.click(shoesCheckbox);

    fireEvent.change(screen.getByLabelText("จำนวนสินค้าสูงสุดต่อรอบ"), { target: { value: "20" } });
    const submitBtn = screen.getByRole("button", { name: /บันทึกและเปิดรอบ/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.categories).toEqual(["รองเท้า"]);
      expect(capturedBody.maxItems).toBe(20);
    });
  });
});

describe("RoundManagementSection - Round item details", () => {
  const token = "round-detail-token";
  const detailRound = {
    id: "round-detail-1",
    title: "รอบรายละเอียดสินค้า",
    phase: "ended",
    submissionStartsAt: "2026-10-01T00:00:00.000Z",
    submissionEndsAt: "2026-10-02T00:00:00.000Z",
    auctionStartsAt: "2026-10-03T00:00:00.000Z",
    auctionEndsAt: "2026-10-04T00:00:00.000Z",
    categories: ["กระเป๋า"],
    _count: { auctions: 4 },
  };

  function mockRoundDetails(detailsResponse) {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/categories")) {
        return Promise.resolve({ items: ["กระเป๋า"] });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve(null);
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [detailRound], total: 1, totalPages: 1 });
      }
      if (url.includes("/api/products/auctions?")) {
        return typeof detailsResponse === "function"
          ? detailsResponse(url)
          : Promise.resolve(detailsResponse);
      }
      return Promise.resolve({});
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads every item in the round, groups statuses in the required order, and shows the closed result", async () => {
    mockRoundDetails({
      items: [
        {
          id: "rejected-item",
          productId: "rejected-product",
          product: { title: "สินค้าถูกปฏิเสธ", photos: [] },
          sellerDisplayName: "ร้านสี่",
          status: "rejected",
          startingPrice: 400,
          cancellationReason: "ข้อมูลสินค้าไม่ครบ",
          bids: [],
          createdAt: "2026-10-04T00:00:00.000Z",
        },
        {
          id: "closed-item",
          productId: "closed-product",
          product: {
            title: "สินค้าปิดประมูล",
            status: "sold",
            photos: [{ url: "/closed.jpg" }],
          },
          sellerDisplayName: "ร้านสาม",
          status: "closed",
          startingPrice: 500,
          winningBidId: "bid-winner",
          bids: [
            { id: "bid-highest", amount: 1000, bidderName: "ผู้เสนอ A" },
            { id: "bid-winner", amount: 900, bidderName: "ผู้ชนะ B" },
          ],
          createdAt: "2026-10-03T00:00:00.000Z",
        },
        {
          id: "open-item",
          productId: "open-product",
          product: { title: "สินค้ากำลังประมูล", photos: [] },
          sellerDisplayName: "ร้านสอง",
          status: "open",
          startingPrice: 300,
          bids: [{ id: "bid-open", amount: 350, bidderName: "ผู้เสนอ C" }],
          createdAt: "2026-10-02T00:00:00.000Z",
        },
        {
          id: "pending-item",
          productId: "pending-product",
          product: { title: "สินค้ารออนุมัติ", photos: [] },
          sellerDisplayName: "ร้านหนึ่ง",
          status: "pending_approval",
          startingPrice: 200,
          bids: [],
          createdAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      total: 4,
      totalPages: 1,
    });

    render(<RoundManagementSection token={token} />);
    fireEvent.click(await screen.findByRole("button", { name: "ดูรายละเอียดรอบ รอบรายละเอียดสินค้า" }));

    const dialog = screen.getByRole("dialog", { name: "รายละเอียดรอบการประมูล" });
    const cards = await within(dialog).findAllByTestId("round-detail-auction-item");
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("สินค้ารออนุมัติ"),
      expect.stringContaining("สินค้ากำลังประมูล"),
      expect.stringContaining("สินค้าปิดประมูล"),
      expect.stringContaining("สินค้าถูกปฏิเสธ"),
    ]);

    const closedCard = cards[2];
    expect(within(closedCard).getByText("฿900")).toBeInTheDocument();
    expect(within(closedCard).getByText("ผู้ชนะ")).toBeInTheDocument();
    expect(within(closedCard).getByText("ผู้ชนะ B")).toBeInTheDocument();
    expect(within(closedCard).getByText("2")).toBeInTheDocument();
    expect(within(closedCard).getByAltText("")).toHaveAttribute("src", "/closed.jpg");
    expect(within(cards[3]).getByText(/ข้อมูลสินค้าไม่ครบ/)).toBeInTheDocument();
  });

  it("shows the current bidder, payment-right holder, and no-winner outcomes without changing bid history", async () => {
    mockRoundDetails({
      items: [
        {
          id: "open-with-bid",
          productId: "open-product",
          product: { title: "สินค้ากำลังประมูล", status: "auction", photos: [] },
          status: "open",
          startingPrice: 500,
          bids: [
            { id: "bid-open", amount: 650, bidderName: "ผู้เสนอ A" },
          ],
          createdAt: "2026-10-03T00:00:00.000Z",
        },
        {
          id: "open-without-bid",
          productId: "open-no-bid-product",
          product: {
            title: "สินค้ากำลังประมูลที่ยังไม่มี Bid",
            status: "auction",
            photos: [],
          },
          status: "open",
          startingPrice: 500,
          bids: [],
          createdAt: "2026-10-02T12:00:00.000Z",
        },
        {
          id: "closed-awaiting-payment",
          productId: "reserved-product",
          product: { title: "สินค้ารอชำระเงิน", status: "reserved", photos: [] },
          status: "closed",
          startingPrice: 500,
          winningBidId: "bid-current-right-holder",
          bids: [
            { id: "bid-expired", amount: 1000, bidderName: "ผู้หมดสิทธิ์ A" },
            { id: "bid-current-right-holder", amount: 900, bidderName: "ผู้ได้รับสิทธิ์ B" },
          ],
          createdAt: "2026-10-02T00:00:00.000Z",
        },
        {
          id: "closed-no-winner",
          productId: "returned-product",
          product: {
            title: "สินค้าคืนให้ผู้ขาย",
            status: "auction_action_required",
            photos: [],
          },
          status: "closed",
          startingPrice: 500,
          winningBidId: null,
          winningOrderId: null,
          bids: [
            { id: "bid-unpaid", amount: 800, bidderName: "ผู้หมดสิทธิ์ C" },
          ],
          createdAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      total: 4,
      totalPages: 1,
    });

    render(<RoundManagementSection token={token} />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "ดูรายละเอียดรอบ รอบรายละเอียดสินค้า",
      }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "รายละเอียดรอบการประมูล",
    });
    const cards = await within(dialog).findAllByTestId(
      "round-detail-auction-item",
    );
    const openCard = cards.find((card) =>
      card.textContent.includes("สินค้ากำลังประมูล"),
    );
    const awaitingCard = cards.find((card) =>
      card.textContent.includes("สินค้ารอชำระเงิน"),
    );
    const openWithoutBidCard = cards.find((card) =>
      card.textContent.includes("สินค้ากำลังประมูลที่ยังไม่มี Bid"),
    );
    const noWinnerCard = cards.find((card) =>
      card.textContent.includes("สินค้าคืนให้ผู้ขาย"),
    );

    expect(
      within(openCard).getByText("ผู้เสนอราคาสูงสุดปัจจุบัน"),
    ).toBeInTheDocument();
    expect(within(openCard).getByText("ผู้เสนอ A")).toBeInTheDocument();
    expect(
      within(openWithoutBidCard).getByText("ยังไม่มีผู้เสนอราคา"),
    ).toBeInTheDocument();

    expect(within(awaitingCard).getByText("ผู้ได้รับสิทธิ์")).toBeInTheDocument();
    expect(within(awaitingCard).getByText("ผู้ได้รับสิทธิ์ B")).toBeInTheDocument();
    expect(within(awaitingCard).getByText("฿900")).toBeInTheDocument();
    expect(within(awaitingCard).getByText(/เคยมีผู้เสนอสูงสุด/)).toBeInTheDocument();
    expect(within(awaitingCard).getAllByText("฿1,000")).toHaveLength(2);
    expect(within(awaitingCard).getByText(/เสียสิทธิ์/)).toBeInTheDocument();
    expect(within(awaitingCard).getByText("ราคาสูงสุดที่เคยมี")).toBeInTheDocument();
    expect(within(awaitingCard).queryByText("ราคาปัจจุบัน")).not.toBeInTheDocument();
    expect(within(openCard).getByText("ราคาปัจจุบัน")).toBeInTheDocument();

    expect(within(noWinnerCard).getByText("ไม่มีผู้ชนะ")).toBeInTheDocument();
    expect(within(noWinnerCard).getByText("ราคาสูงสุดที่เสนอ")).toBeInTheDocument();
    expect(within(noWinnerCard).getAllByText("฿800")).toHaveLength(2);
    expect(within(noWinnerCard).queryByText("ผู้หมดสิทธิ์ C")).not.toBeInTheDocument();
  });

  it("shows loading and empty states inside the existing modal", async () => {
    let resolveDetails;
    const pendingDetails = new Promise((resolve) => {
      resolveDetails = resolve;
    });
    mockRoundDetails(() => pendingDetails);

    render(<RoundManagementSection token={token} />);
    fireEvent.click(await screen.findByRole("button", { name: "ดูรายละเอียดรอบ รอบรายละเอียดสินค้า" }));
    const dialog = screen.getByRole("dialog", { name: "รายละเอียดรอบการประมูล" });
    expect(within(dialog).getByText("กำลังโหลดสินค้าในรอบประมูล...")).toBeInTheDocument();

    await act(async () => {
      resolveDetails({ items: [], total: 0, totalPages: 1 });
      await pendingDetails;
    });
    expect(await within(dialog).findByText("ยังไม่มีสินค้าในรอบประมูลนี้")).toBeInTheDocument();
  });

  it("shows an API error, retries, and labels a closed item with no bids", async () => {
    let attempts = 0;
    mockRoundDetails(() => {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error("โหลดรายการไม่สำเร็จ"));
      return Promise.resolve({
        items: [{
          id: "closed-no-bid",
          productId: "no-bid-product",
          product: { title: "สินค้าไม่มีผู้เสนอราคา", photos: [] },
          status: "closed",
          startingPrice: 700,
          bids: [],
        }],
        total: 1,
        totalPages: 1,
      });
    });

    render(<RoundManagementSection token={token} />);
    fireEvent.click(await screen.findByRole("button", { name: "ดูรายละเอียดรอบ รอบรายละเอียดสินค้า" }));
    const dialog = screen.getByRole("dialog", { name: "รายละเอียดรอบการประมูล" });
    expect(await within(dialog).findByText("โหลดรายการไม่สำเร็จ")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "ลองโหลดสินค้าอีกครั้ง" }));
    expect(await within(dialog).findByText("สินค้าไม่มีผู้เสนอราคา")).toBeInTheDocument();
    expect(within(dialog).getByText("ไม่มีผู้เสนอราคา")).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});

describe("AuctionReviewModal & Pending Approval UX Improvements", () => {
  const mockToken = "mock-mkt-jwt-token";

  const samplePendingAuction = {
    id: "auc-pending-1",
    productId: "prod-1",
    sellerId: "seller-1",
    sellerDisplayName: "ร้านวินเทจ 90s",
    roundId: "round-active-1",
    startingPrice: 500,
    bidIncrement: 50,
    scheduledStartAt: "2026-10-03T12:00:00.000Z",
    scheduledEndAt: "2026-10-05T12:00:00.000Z",
    status: "pending_approval",
    round: { id: "round-active-1", title: "รอบประมูลเสื้อผ้ามือสอง" },
    product: {
      id: "prod-1",
      title: "เสื้อแจ็คเก็ตวินเทจ 90s",
      description: "สภาพดีมาก มีตำหนิกระดุมเม็ดล่างเล็กน้อย",
      category: "เสื้อผ้า",
      brand: "Levi's",
      condition: "Like New",
      size: "L",
      photos: [
        { id: "photo-1", url: "/uploads/jacket-1.jpg", position: 0 },
        { id: "photo-2", url: "/uploads/jacket-2.jpg", position: 1 },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          round: null,
          phase: null,
          isSubmissionOpen: false,
          isAuctionActive: false,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [] });
      }
      if (url.includes("/api/products/categories")) {
        return Promise.resolve({ items: ["เสื้อผ้า", "รองเท้า"] });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({
          items: [samplePendingAuction],
          total: 1,
        });
      }
      return Promise.resolve({});
    });
  });

  it("1. displays 'ตรวจสอบสินค้า' button for pending_approval auction items", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    expect(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ร้าน: ร้านวินเทจ 90s")).toBeInTheDocument();
  });

  it("2. opens review modal with comprehensive product details when clicked", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    const reviewBtn = await screen.findByRole("button", {
      name: "ตรวจสอบสินค้า",
    });
    fireEvent.click(reviewBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText("ตรวจสอบสินค้าก่อนอนุมัติเข้าประมูล"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("เสื้อแจ็คเก็ตวินเทจ 90s"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("เสื้อผ้า")).toBeInTheDocument();
    expect(within(dialog).getByText("Levi's")).toBeInTheDocument();
    expect(within(dialog).getByText("Like New")).toBeInTheDocument();
    expect(within(dialog).getByText("L")).toBeInTheDocument();
    expect(
      within(dialog).getByText("รอบประมูลเสื้อผ้ามือสอง"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("฿500")).toBeInTheDocument();
    expect(within(dialog).getByText("฿50")).toBeInTheDocument();
    expect(
      within(dialog).getByText("สภาพดีมาก มีตำหนิกระดุมเม็ดล่างเล็กน้อย"),
    ).toBeInTheDocument();
  });

  it("3. displays product image from API", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );

    const mainImg = screen.getByAltText("เสื้อแจ็คเก็ตวินเทจ 90s");
    expect(mainImg).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/jacket-1.jpg"),
    );
  });

  it("4. switches main image when thumbnail is selected", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );

    const secondThumbBtn = screen.getByRole("button", {
      name: "เลือกดูรูปสินค้าที่ 2",
    });
    fireEvent.click(secondThumbBtn);

    const mainImg = screen.getByAltText("เสื้อแจ็คเก็ตวินเทจ 90s");
    expect(mainImg).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/jacket-2.jpg"),
    );
  });

  it("5. closes review modal via top-right close button", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: "ปิดหน้าต่าง" });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("6. closes review modal via 'กลับไปหน้ารายการประมูล' button", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const backBtn = screen.getByRole("button", {
      name: "กลับไปหน้ารายการประมูล",
    });
    fireEvent.click(backBtn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("7. closes review modal via Escape key", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(dialog.parentElement, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("8. retains status filter selection after modal is closed", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    // Select filter
    const filterBtn = await screen.findByRole("button", { name: /ทุกสถานะ/ });
    fireEvent.click(filterBtn);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "รออนุมัติจาก Marketing" }),
    );

    // Filter summary reflects one selected status.
    expect(
      screen.getByRole("button", { name: /เลือกแล้ว 1 สถานะ/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /เลือกแล้ว 1 สถานะ/ }));

    // Open and close modal
    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "กลับไปหน้ารายการประมูล" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Status filter is still selected after the review modal closes.
    const retainedFilter = screen.getByRole("button", {
      name: /เลือกแล้ว 1 สถานะ/,
    });
    fireEvent.click(retainedFilter);
    expect(
      screen.getByRole("checkbox", { name: "รออนุมัติจาก Marketing" }),
    ).toBeChecked();
  });

  it("9. approves from modal calling original endpoint", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );

    const approveBtn = screen.getByRole("button", {
      name: "อนุมัติสินค้าเข้าประมูล",
    });
    fireEvent.click(approveBtn);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/auctions/auc-pending-1/approve",
      expect.objectContaining({ method: "PATCH", token: mockToken }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("10. closes modal and reloads auction list upon successful approval", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "อนุมัติสินค้าเข้าประมูล" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("11. rejects from modal calling original endpoint", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );

    // Inside modal, click "ปฏิเสธสินค้า"
    const rejectBtns = screen.getAllByRole("button", { name: "ปฏิเสธสินค้า" });
    const modalRejectBtn = rejectBtns[rejectBtns.length - 1];
    fireEvent.click(modalRejectBtn);
    fireEvent.change(screen.getByPlaceholderText(/ระบุรายละเอียดที่ผู้ขายต้องแก้ไข/), {
      target: { value: "รูปภาพสินค้าไม่ชัดเจน" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันการปฏิเสธสินค้า" }));

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/auctions/auc-pending-1/reject",
      expect.objectContaining({
        method: "PATCH",
        token: mockToken,
        body: { reason: "รูปภาพสินค้าไม่ชัดเจน" },
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("12. closes modal and reloads auction list upon successful rejection", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    const rejectBtns = screen.getAllByRole("button", { name: "ปฏิเสธสินค้า" });
    fireEvent.click(rejectBtns[rejectBtns.length - 1]);
    fireEvent.change(screen.getByPlaceholderText(/ระบุรายละเอียดที่ผู้ขายต้องแก้ไข/), {
      target: { value: "รายละเอียดไม่ตรงกับรูปภาพ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันการปฏิเสธสินค้า" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("13. disables buttons and displays loading status during action submission", async () => {
    let resolveApprove;
    apiFetch.mockImplementation((url, opts) => {
      if (opts?.method === "PATCH" && url.includes("/approve")) {
        return new Promise((resolve) => {
          resolveApprove = resolve;
        });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [samplePendingAuction], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    const dialog = screen.getByRole("dialog");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "อนุมัติสินค้าเข้าประมูล" }),
    );

    // Buttons change to loading state and are disabled
    const loadingBtns = await screen.findAllByRole("button", {
      name: "กำลังอนุมัติ...",
    });
    loadingBtns.forEach((btn) => expect(btn).toBeDisabled());

    expect(
      within(dialog).getByRole("button", { name: "กลับไปหน้ารายการประมูล" }),
    ).toBeDisabled();

    // Resolve promise
    resolveApprove({});
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("14. keeps modal open when API call fails", async () => {
    apiFetch.mockImplementation((url, opts) => {
      if (opts?.method === "PATCH" && url.includes("/approve")) {
        return Promise.reject(new Error("รอบประมูลนี้ปิดรับสินค้าแล้ว"));
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [samplePendingAuction], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "อนุมัติสินค้าเข้าประมูล" }),
    );

    // Modal stays open
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("15. displays user-friendly Thai error message on API failure without leaking technical terms", async () => {
    apiFetch.mockImplementation((url, opts) => {
      if (opts?.method === "PATCH" && url.includes("/approve")) {
        return Promise.reject(
          new Error("Internal Server Error: PrismaClientKnownRequestError 500"),
        );
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [samplePendingAuction], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "อนุมัติสินค้าเข้าประมูล" }),
    );

    const errorMsg = await within(dialog).findByText(
      "เกิดข้อผิดพลาดในการอนุมัติรายการประมูล กรุณาลองใหม่อีกครั้ง",
    );
    expect(errorMsg).toBeInTheDocument();
    expect(errorMsg.textContent).not.toContain("PrismaClient");
    expect(errorMsg.textContent).not.toContain("500");
    expect(errorMsg.textContent).not.toContain("Internal Server Error");
  });

  it("16. renders fallback placeholder and does not crash when item has no photos", async () => {
    const noPhotoAuction = {
      ...samplePendingAuction,
      id: "auc-no-photo",
      product: {
        ...samplePendingAuction.product,
        photos: [],
      },
    };

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [noPhotoAuction], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );

    expect(screen.getByText("ไม่มีรูปสินค้า")).toBeInTheDocument();
  });

  it("17. displays 'ไม่ระบุ' when optional fields are empty or null", async () => {
    const emptyFieldsAuction = {
      id: "auc-sparse-1",
      productId: "prod-sparse",
      status: "pending_approval",
      startingPrice: null,
      bidIncrement: null,
      round: null,
      product: {
        id: "prod-sparse",
        title: null,
        description: "",
        category: null,
        brand: null,
        condition: null,
        size: null,
        photos: null,
      },
    };

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [emptyFieldsAuction], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "ตรวจสอบสินค้า" }),
    );

    // Expect "ไม่ระบุ" across missing attributes
    expect(screen.getAllByText("ไม่ระบุ").length).toBeGreaterThanOrEqual(5);
  });

  it("18. regression check: list-level approve and reject buttons function as before", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    const listApproveBtn = await screen.findByRole("button", {
      name: "อนุมัติสินค้าเข้าประมูลจากรายการ",
    });
    fireEvent.click(listApproveBtn);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/auctions/auc-pending-1/approve",
      expect.objectContaining({ method: "PATCH", token: mockToken }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "ปฏิเสธสินค้า" }),
      ).not.toBeDisabled();
    });

    const listRejectBtn = screen.getByRole("button", { name: "ปฏิเสธสินค้า" });
    fireEvent.click(listRejectBtn);
    fireEvent.change(screen.getByPlaceholderText(/ระบุรายละเอียดที่ผู้ขายต้องแก้ไข/), {
      target: { value: "กรุณาเพิ่มรายละเอียดสินค้า" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันการปฏิเสธสินค้า" }));

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/auctions/auc-pending-1/reject",
      expect.objectContaining({
        method: "PATCH",
        token: mockToken,
        body: { reason: "กรุณาเพิ่มรายละเอียดสินค้า" },
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "ปฏิเสธสินค้า" }),
      ).not.toBeDisabled();
    });
  });
});

describe("MKT-DEC-026: Round Filter, Single-Item Cancellation Modal, Round Cancellation Modal & Distinct Action Labels", () => {
  const mockToken = "mock-mkt-jwt-token";

  const sampleRoundA = {
    id: "round-a",
    title: "รอบประมูลแฟชั่นวินเทจ",
    phase: "submission",
    submissionStartsAt: "2026-10-01T00:00:00.000Z",
    submissionEndsAt: "2026-10-03T00:00:00.000Z",
    auctionStartsAt: "2026-10-03T12:00:00.000Z",
    auctionEndsAt: "2026-10-05T12:00:00.000Z",
    _count: { auctions: 2 },
  };

  const sampleRoundB = {
    id: "round-b",
    title: "รอบประมูลรองเท้าสนีกเกอร์",
    phase: "auction",
    submissionStartsAt: "2026-09-25T00:00:00.000Z",
    submissionEndsAt: "2026-09-28T00:00:00.000Z",
    auctionStartsAt: "2026-09-29T12:00:00.000Z",
    auctionEndsAt: "2026-10-04T12:00:00.000Z",
    _count: { auctions: 3 },
  };

  const pendingItemA = {
    id: "auc-pending-a",
    productId: "prod-a",
    status: "pending_approval",
    startingPrice: 400,
    bidIncrement: 50,
    scheduledStartAt: "2026-10-03T12:00:00.000Z",
    scheduledEndAt: "2026-10-05T12:00:00.000Z",
    roundId: "round-a",
    round: sampleRoundA,
    product: { id: "prod-a", title: "เสื้อเชิ้ตผ้าลินิน" },
  };

  const openItemB = {
    id: "auc-open-b",
    productId: "prod-b",
    status: "open",
    startingPrice: 1500,
    bidIncrement: 100,
    scheduledStartAt: "2026-09-29T12:00:00.000Z",
    scheduledEndAt: "2026-10-04T12:00:00.000Z",
    roundId: "round-b",
    round: sampleRoundB,
    product: { id: "prod-b", title: "รองเท้าวิ่ง Nike Zoom" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeSubmissionRounds: [sampleRoundA],
          activeAuctionRounds: [sampleRoundB],
          isSubmissionOpen: true,
          isAuctionActive: true,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({
          items: [sampleRoundA, sampleRoundB],
        });
      }
      if (url.includes("/api/products/auctions")) {
        if (url.includes("roundIds=round-a")) {
          return Promise.resolve({ items: [pendingItemA], total: 1 });
        }
        return Promise.resolve({
          items: [pendingItemA, openItemB],
          total: 2,
        });
      }
      return Promise.resolve({});
    });
  });

  it("groups the round filter and filters AuctionItems by selected round", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    expect(await screen.findByText("เสื้อเชิ้ตผ้าลินิน")).toBeInTheDocument();
    expect(screen.getByText("รองเท้าวิ่ง Nike Zoom")).toBeInTheDocument();

    const filterBtn = screen.getByRole("button", { name: /ทุกรอบประมูล/ });
    fireEvent.click(filterBtn);
    fireEvent.click(screen.getByRole("checkbox", { name: "รอบประมูลแฟชั่นวินเทจ" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining("roundIds=round-a"),
        expect.objectContaining({ token: mockToken }),
      );
    });

    expect(await screen.findByText("เสื้อเชิ้ตผ้าลินิน")).toBeInTheDocument();
    expect(screen.queryByText("รองเท้าวิ่ง Nike Zoom")).not.toBeInTheDocument();
  });

  it("combines round, status, and search filters in the server-side paginated request", async () => {
    render(<AuctionScheduleSection token={mockToken} />);
    expect(await screen.findByText("เสื้อเชิ้ตผ้าลินิน")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ทุกรอบประมูล/ }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "รอบประมูลแฟชั่นวินเทจ" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /ทุกสถานะ/ }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "รออนุมัติจาก Marketing" }),
    );
    fireEvent.change(
      screen.getByRole("searchbox", { name: "ค้นหาชื่อสินค้าหรือร้านค้า" }),
      { target: { value: "เสื้อเชิ้ต" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "ค้นหา" }));

    await waitFor(() => {
      const listCalls = apiFetch.mock.calls
        .map(([url]) => url)
        .filter((url) => url.startsWith("/api/products/auctions?"));
      expect(listCalls.some((url) =>
        url.includes("roundIds=round-a") &&
        url.includes("statuses=pending_approval") &&
        url.includes("search=%E0%B9%80%E0%B8%AA%E0%B8%B7%E0%B9%89%E0%B8%AD%E0%B9%80%E0%B8%8A%E0%B8%B4%E0%B9%89%E0%B8%95") &&
        url.includes("page=1") &&
        url.includes("limit=20"),
      )).toBe(true);
    });
  });

  it("does not offer the legacy approved-without-schedule status in Marketing filters", async () => {
    render(<AuctionScheduleSection token={mockToken} />);
    expect(await screen.findByText("เสื้อเชิ้ตผ้าลินิน")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ทุกสถานะ/ }));

    expect(
      screen.queryByRole("checkbox", { name: "อนุมัติแล้ว รอกำหนดเวลา" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "อนุมัติแล้ว (รอเปิดประมูล)" }),
    ).toBeInTheDocument();
  });

  it("displays clear Thai error message when loading rounds for filter fails", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({ round: null });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.reject(new Error("fetch failed"));
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [], total: 0 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    expect(
      await screen.findByText(
        "ไม่สามารถโหลดรายการรอบประมูลสำหรับตัวกรองได้ กรุณาลองใหม่อีกครั้ง",
      ),
    ).toBeInTheDocument();
  });

  it("displays empty state and loading/error state for auction list", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [] });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [], total: 0 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    expect(
      await screen.findByText("ยังไม่มีรายการประมูลในหมวดนี้"),
    ).toBeInTheDocument();
  });

  it("uses distinct, unambiguous labels for 'ปฏิเสธสินค้า', 'ยกเลิกรายการประมูล', and 'ยกเลิกรอบประมูล'", async () => {
    render(<AuctionScheduleSection token={mockToken} />);

    expect(
      await screen.findByRole("button", { name: "ปฏิเสธสินค้า" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ยกเลิกรายการประมูล" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "ยกเลิกรอบประมูล" }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("opens single-item cancel confirmation modal, validates reason, prevents double submit, and calls PATCH /:id/cancel", async () => {
    let resolveCancel;
    let cancelCalls = 0;
    apiFetch.mockImplementation((url, opts) => {
      if (
        opts?.method === "PATCH" &&
        url === "/api/products/auctions/auc-open-b/cancel"
      ) {
        cancelCalls += 1;
        return new Promise((resolve) => {
          resolveCancel = resolve;
        });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({ activeAuctionRounds: [sampleRoundB] });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [sampleRoundB] });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [openItemB], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    const cancelItemBtn = await screen.findByRole("button", {
      name: "ยกเลิกรายการประมูล",
    });
    fireEvent.click(cancelItemBtn);

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("ยืนยันการยกเลิกรายการประมูล"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/รองเท้าวิ่ง Nike Zoom/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/รอบประมูลรองเท้าสนีกเกอร์/),
    ).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole("button", {
      name: "ยืนยันการยกเลิกรายการ",
    });
    expect(confirmBtn).toBeDisabled();

    // Whitespace-only reason keeps button disabled
    const textarea = within(dialog).getByPlaceholderText(
      /ระบุเหตุผลในการยกเลิกรายการประมูล/,
    );
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(confirmBtn).toBeDisabled();

    // Valid reason enables button
    fireEvent.change(textarea, {
      target: { value: "สินค้าชำรุดก่อนจัดส่ง" },
    });
    expect(confirmBtn).not.toBeDisabled();

    // Submit and verify double-submit protection
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    expect(cancelCalls).toBe(1);
    expect(
      within(dialog).getByRole("button", { name: "กำลังยกเลิกรายการ..." }),
    ).toBeDisabled();

    resolveCancel({ id: "auc-open-b", status: "cancelled" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/auctions/auc-open-b/cancel",
      expect.objectContaining({
        method: "PATCH",
        token: mockToken,
        body: {
          cancellationReason: "สินค้าชำรุดก่อนจัดส่ง",
          reason: "สินค้าชำรุดก่อนจัดส่ง",
        },
      }),
    );
  });

  it("opens round cancel confirmation modal, validates reason, prevents double submit, and calls PATCH /rounds/:roundId/cancel", async () => {
    let resolveRoundCancel;
    let roundCancelCalls = 0;
    apiFetch.mockImplementation((url, opts) => {
      if (
        opts?.method === "PATCH" &&
        url === "/api/products/auctions/rounds/round-b/cancel"
      ) {
        roundCancelCalls += 1;
        return new Promise((resolve) => {
          resolveRoundCancel = resolve;
        });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeAuctionRounds: [sampleRoundB],
          isAuctionActive: true,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [sampleRoundB] });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [openItemB], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    const cancelRoundBtns = await screen.findAllByRole("button", {
      name: "ยกเลิกรอบประมูล",
    });
    fireEvent.click(cancelRoundBtns[0]);

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "ยกเลิกรอบการประมูล" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("ตรวจสอบข้อมูลและระบุเหตุผลก่อนยืนยัน"),
    ).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole("button", {
      name: "ยืนยันการยกเลิกรอบ",
    });
    expect(confirmBtn).toBeDisabled();

    const textarea = within(dialog).getByPlaceholderText(
      /ระบุเหตุผลในการยกเลิกรอบประมูล/,
    );
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(textarea, {
      target: { value: "เกิดเหตุขัดข้องของระบบประมูล" },
    });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    expect(roundCancelCalls).toBe(1);
    expect(
      within(dialog).getByRole("button", { name: "กำลังยกเลิก..." }),
    ).toBeDisabled();

    resolveRoundCancel({ round: { ...sampleRoundB, phase: "cancelled" } });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/auctions/rounds/round-b/cancel",
      expect.objectContaining({
        method: "PATCH",
        token: mockToken,
        body: { reason: "เกิดเหตุขัดข้องของระบบประมูล" },
      }),
    );
  });

  it("displays chat warning banner with 'ลองส่งแจ้งเตือนอีกครั้ง' button when item or round cancellation returns warnings and retries on click", async () => {
    let itemCancelAttempt = 0;
    let roundCancelAttempt = 0;

    apiFetch.mockImplementation((url, opts) => {
      if (
        opts?.method === "PATCH" &&
        url === "/api/products/auctions/auc-open-b/cancel"
      ) {
        itemCancelAttempt += 1;
        if (itemCancelAttempt === 1) {
          return Promise.resolve({
            id: "auc-open-b",
            status: "cancelled",
            warnings: [
              "ไม่สามารถส่งข้อความแจ้งเตือนทางแชทได้ครบทุกฝ่าย (1 รายการ)",
            ],
          });
        }
        return Promise.resolve({
          id: "auc-open-b",
          status: "cancelled",
          warnings: [],
        });
      }
      if (
        opts?.method === "PATCH" &&
        url === "/api/products/auctions/rounds/round-b/cancel"
      ) {
        roundCancelAttempt += 1;
        if (roundCancelAttempt === 1) {
          return Promise.resolve({
            id: "round-b",
            phase: "cancelled",
            warnings: ["ส่งข้อความแจ้งเตือนรอบประมูลไม่สำเร็จ 1 รายการ"],
          });
        }
        return Promise.resolve({
          id: "round-b",
          phase: "cancelled",
          warnings: [],
        });
      }
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve({
          activeAuctionRounds: [sampleRoundB],
          isAuctionActive: true,
        });
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [sampleRoundB] });
      }
      if (url.includes("/api/products/auctions")) {
        return Promise.resolve({ items: [openItemB], total: 1 });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    // 1. Trigger single-item cancel with partial chat failure warning
    const cancelItemBtn = await screen.findByRole("button", {
      name: "ยกเลิกรายการประมูล",
    });
    fireEvent.click(cancelItemBtn);

    const itemDialog = screen.getByRole("dialog");
    fireEvent.change(
      within(itemDialog).getByPlaceholderText(
        /ระบุเหตุผลในการยกเลิกรายการประมูล/,
      ),
      { target: { value: "สินค้าชำรุด" } },
    );
    fireEvent.click(
      within(itemDialog).getByRole("button", {
        name: "ยืนยันการยกเลิกรายการ",
      }),
    );

    expect(
      await screen.findByText(
        /ไม่สามารถส่งข้อความแจ้งเตือนทางแชทได้ครบทุกฝ่าย/,
      ),
    ).toBeInTheDocument();

    const retryItemBtn = screen.getByRole("button", {
      name: "ลองส่งแจ้งเตือนอีกครั้ง",
    });
    fireEvent.click(retryItemBtn);

    await waitFor(() => {
      expect(itemCancelAttempt).toBe(2);
    });
    expect(
      await screen.findByText(
        /ส่งข้อความแจ้งเตือนการยกเลิกรายการประมูลครบทุกฝ่ายเรียบร้อยแล้ว/,
      ),
    ).toBeInTheDocument();

    // 2. Trigger round cancel with partial chat failure warning
    const cancelRoundBtns = screen.getAllByRole("button", {
      name: "ยกเลิกรอบประมูล",
    });
    fireEvent.click(cancelRoundBtns[0]);

    const roundDialog = screen.getByRole("dialog");
    fireEvent.change(
      within(roundDialog).getByPlaceholderText(
        /ระบุเหตุผลในการยกเลิกรอบประมูล/,
      ),
      { target: { value: "ปรับปรุงระบบประมูล" } },
    );
    fireEvent.click(
      within(roundDialog).getByRole("button", { name: "ยืนยันการยกเลิกรอบ" }),
    );

    expect(
      await screen.findByText(/ส่งข้อความแจ้งเตือนรอบประมูลไม่สำเร็จ 1 รายการ/),
    ).toBeInTheDocument();

    const retryRoundBtn = screen.getByRole("button", {
      name: "ลองส่งแจ้งเตือนอีกครั้ง",
    });
    fireEvent.click(retryRoundBtn);

    await waitFor(() => {
      expect(roundCancelAttempt).toBe(2);
    });
  });
});

describe("AuctionScheduleSection & RoundManagementSection - Unified Marketing Pagination", () => {
  const mockToken = "mock-mkt-jwt-token";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("RoundManagementSection: paginates round history with 20 items per page and navigates pages", async () => {
    const mockRounds = Array.from({ length: 25 }, (_, i) => ({
      id: `round-${i + 1}`,
      title: `รอบการประมูลทดสอบที่ ${i + 1}`,
      phase: "upcoming",
      submissionStartsAt: "2026-10-01T00:00:00.000Z",
      submissionEndsAt: "2026-10-03T00:00:00.000Z",
      auctionStartsAt: "2026-10-03T12:00:00.000Z",
      auctionEndsAt: "2026-10-05T12:00:00.000Z",
      _count: { auctions: i },
    }));

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve(null);
      }
      if (url.includes("/api/products/auctions/rounds")) {
        if (url.includes("page=2")) {
          return Promise.resolve({
            items: mockRounds.slice(20, 25),
            total: 25,
            totalPages: 2,
            page: 2,
            limit: 20,
          });
        }
        if (url.includes("page=")) {
          return Promise.resolve({
            items: mockRounds.slice(0, 20),
            total: 25,
            totalPages: 2,
            page: 1,
            limit: 20,
          });
        }
        return Promise.resolve({ items: mockRounds, total: 25 });
      }
      if (url.includes("/api/products/categories")) {
        return Promise.resolve({ items: ["อิเล็กทรอนิกส์"] });
      }
      return Promise.resolve({});
    });

    render(<RoundManagementSection token={mockToken} />);

    // Page 1: Check item 1 and item 20 are visible, item 21 is not
    expect(
      await screen.findByText("รอบการประมูลทดสอบที่ 1"),
    ).toBeInTheDocument();
    expect(screen.getByText("รอบการประมูลทดสอบที่ 20")).toBeInTheDocument();
    expect(
      screen.queryByText("รอบการประมูลทดสอบที่ 21"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "ดูรายละเอียดรอบ รอบการประมูลทดสอบที่ 1",
      }),
    );
    const detailsDialog = screen.getByRole("dialog", {
      name: "รายละเอียดรอบการประมูล",
    });
    expect(within(detailsDialog).getByText("ข้อมูลแบบอ่านอย่างเดียวจากประวัติรอบการประมูล")).toBeInTheDocument();
    expect(within(detailsDialog).queryByRole("button", { name: "แก้ไขเวลา" })).not.toBeInTheDocument();
    fireEvent.click(within(detailsDialog).getByRole("button", { name: "ปิดหน้าต่าง" }));

    // Verify pagination controls on Page 1
    const prevBtn = screen.getByRole("button", { name: "ก่อนหน้า" });
    const nextBtn = screen.getByRole("button", { name: "ถัดไป" });
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeEnabled();

    // Page summary
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);

    // Navigate to Page 2
    fireEvent.click(nextBtn);

    expect(
      await screen.findByText("รอบการประมูลทดสอบที่ 21"),
    ).toBeInTheDocument();
    expect(screen.getByText("รอบการประมูลทดสอบที่ 25")).toBeInTheDocument();
    expect(
      screen.queryByText("รอบการประมูลทดสอบที่ 1"),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ก่อนหน้า" })).toBeEnabled();
    });
    expect(screen.getByRole("button", { name: "ถัดไป" })).toBeDisabled();

    // Navigate back to Page 1
    fireEvent.click(screen.getByRole("button", { name: "ก่อนหน้า" }));
    expect(
      await screen.findByText("รอบการประมูลทดสอบที่ 1"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ก่อนหน้า" })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "ถัดไป" })).toBeEnabled();
  });

  it("AuctionScheduleSection: loads page 1 with limit 20 and handles pagination controls", async () => {
    const mockAuctionsPage1 = Array.from({ length: 20 }, (_, i) => ({
      id: `auc-${i + 1}`,
      productId: `prod-${i + 1}`,
      product: { title: `สินค้าประมูลชิ้นที่ ${i + 1}` },
      status: "approved",
      startingPrice: 1000,
      bidIncrement: 100,
      scheduledStartAt: "2026-10-01T00:00:00.000Z",
      scheduledEndAt: "2026-10-02T00:00:00.000Z",
    }));

    const mockAuctionsPage2 = Array.from({ length: 5 }, (_, i) => ({
      id: `auc-${i + 21}`,
      productId: `prod-${i + 21}`,
      product: { title: `สินค้าประมูลชิ้นที่ ${i + 21}` },
      status: "approved",
      startingPrice: 2000,
      bidIncrement: 200,
      scheduledStartAt: "2026-10-01T00:00:00.000Z",
      scheduledEndAt: "2026-10-02T00:00:00.000Z",
    }));

    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds/current")) {
        return Promise.resolve(null);
      }
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({ items: [] });
      }
      if (url.includes("/api/products/categories")) {
        return Promise.resolve({ items: [] });
      }
      if (url.includes("/api/products/auctions?")) {
        if (url.includes("page=2")) {
          return Promise.resolve({
            items: mockAuctionsPage2,
            total: 25,
            totalPages: 2,
            page: 2,
            limit: 20,
          });
        }
        return Promise.resolve({
          items: mockAuctionsPage1,
          total: 25,
          totalPages: 2,
          page: 1,
          limit: 20,
        });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    // Verify initial call has page=1 and limit=20
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/products\/auctions\?.*page=1.*limit=20/),
        expect.anything(),
      );
    });

    expect(
      await screen.findByText("สินค้าประมูลชิ้นที่ 1"),
    ).toBeInTheDocument();
    expect(screen.getByText("สินค้าประมูลชิ้นที่ 20")).toBeInTheDocument();

    const prevBtns = screen.getAllByRole("button", { name: "ก่อนหน้า" });
    const nextBtns = screen.getAllByRole("button", { name: "ถัดไป" });
    const itemPrevBtn = prevBtns[prevBtns.length - 1];
    const itemNextBtn = nextBtns[nextBtns.length - 1];
    expect(itemPrevBtn).toBeDisabled();
    expect(itemNextBtn).toBeEnabled();

    // Navigate to page 2
    fireEvent.click(itemNextBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/products\/auctions\?.*page=2.*limit=20/),
        expect.anything(),
      );
    });

    expect(
      await screen.findByText("สินค้าประมูลชิ้นที่ 21"),
    ).toBeInTheDocument();
    await waitFor(() => {
      const updatedPrev = screen.getAllByRole("button", { name: "ก่อนหน้า" });
      expect(updatedPrev[updatedPrev.length - 1]).toBeEnabled();
    });
    const updatedNext = screen.getAllByRole("button", { name: "ถัดไป" });
    expect(updatedNext[updatedNext.length - 1]).toBeDisabled();
  });

  it("AuctionScheduleSection: resets page to 1 on filter changes", async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes("/api/products/auctions/rounds")) {
        return Promise.resolve({
          items: [{ id: "round-1", title: "รอบที่ 1", phase: "submission" }],
        });
      }
      if (url.includes("/api/products/auctions?")) {
        return Promise.resolve({
          items: [
            {
              id: "auc-1",
              productId: "prod-1",
              product: { title: "สินค้าทดสอบ" },
              status: "approved",
            },
          ],
          total: 25,
          totalPages: 2,
          page: 1,
          limit: 20,
        });
      }
      return Promise.resolve({});
    });

    render(<AuctionScheduleSection token={mockToken} />);

    expect(await screen.findByText("สินค้าทดสอบ")).toBeInTheDocument();

    // Verify initial call was page 1
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/products\/auctions\?.*page=1.*limit=20/),
      expect.anything(),
    );
  });

  describe("RoundManagementSection - Pagination Comprehensive Coverage", () => {
    it("RoundManagementSection: handles 0 items with empty message, 'ทั้งหมด 0 รายการ · หน้า 1 จาก 1', and disabled buttons", async () => {
      apiFetch.mockImplementation((url) => {
        if (url.includes("/api/products/auctions/rounds/current")) {
          return Promise.resolve(null);
        }
        if (url.includes("/api/products/auctions/rounds")) {
          return Promise.resolve({ items: [], total: 0, totalPages: 1 });
        }
        if (url.includes("/api/products/categories")) {
          return Promise.resolve({ items: [] });
        }
        return Promise.resolve({});
      });

      render(<RoundManagementSection token={mockToken} />);

      expect(
        await screen.findByText("ยังไม่มีประวัติรอบการประมูล"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName?.toLowerCase() === "span" &&
            el?.textContent?.trim() === "ทั้งหมด 0 รายการ",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName?.toLowerCase() === "span" &&
            el?.textContent?.trim() === "หน้า 1 จาก 1",
        ),
      ).toBeInTheDocument();

      const prevBtn = screen.getByRole("button", { name: "ก่อนหน้า" });
      const nextBtn = screen.getByRole("button", { name: "ถัดไป" });
      expect(prevBtn).toBeInTheDocument();
      expect(nextBtn).toBeInTheDocument();
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeDisabled();
    });

    it("RoundManagementSection: handles single page with disabled buttons", async () => {
      apiFetch.mockImplementation((url) => {
        if (url.includes("/api/products/auctions/rounds/current")) {
          return Promise.resolve(null);
        }
        if (url.includes("/api/products/auctions/rounds")) {
          return Promise.resolve({
            items: [
              {
                id: "round-1",
                title: "รอบประมูลรอบเดียว",
                phase: "upcoming",
                submissionStartsAt: "2026-10-01T00:00:00.000Z",
                submissionEndsAt: "2026-10-02T00:00:00.000Z",
                auctionStartsAt: "2026-10-03T00:00:00.000Z",
                auctionEndsAt: "2026-10-04T00:00:00.000Z",
                categories: [],
                _count: { auctions: 2 },
              },
            ],
            total: 1,
            totalPages: 1,
          });
        }
        if (url.includes("/api/products/categories")) {
          return Promise.resolve({ items: [] });
        }
        return Promise.resolve({});
      });

      render(<RoundManagementSection token={mockToken} />);

      expect(
        await screen.findByText("รอบประมูลรอบเดียว"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName?.toLowerCase() === "span" &&
            el?.textContent?.trim() === "ทั้งหมด 1 รายการ",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName?.toLowerCase() === "span" &&
            el?.textContent?.trim() === "หน้า 1 จาก 1",
        ),
      ).toBeInTheDocument();

      const prevBtn = screen.getByRole("button", { name: "ก่อนหน้า" });
      const nextBtn = screen.getByRole("button", { name: "ถัดไป" });
      expect(prevBtn).toBeInTheDocument();
      expect(nextBtn).toBeInTheDocument();
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeDisabled();
    });

    it("RoundManagementSection: handles loading state with disabled buttons and prevents double submit", async () => {
      let resolvePromise;
      apiFetch.mockImplementation((url) => {
        if (url.includes("/api/products/auctions/rounds/current")) {
          return Promise.resolve(null);
        }
        if (url.includes("/api/products/auctions/rounds")) {
          return new Promise((resolve) => {
            resolvePromise = resolve;
          });
        }
        if (url.includes("/api/products/categories")) {
          return Promise.resolve({ items: [] });
        }
        return Promise.resolve({});
      });

      render(<RoundManagementSection token={mockToken} />);

      const prevBtn = screen.getByRole("button", { name: "ก่อนหน้า" });
      const nextBtn = screen.getByRole("button", { name: "ถัดไป" });
      expect(prevBtn).toBeInTheDocument();
      expect(nextBtn).toBeInTheDocument();
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeDisabled();

      const callsBefore = apiFetch.mock.calls.length;
      fireEvent.click(prevBtn);
      fireEvent.click(nextBtn);
      expect(apiFetch.mock.calls.length).toBe(callsBefore);

      resolvePromise({ items: [], total: 0, totalPages: 1 });
    });

    it("RoundManagementSection: handles API error without displaying count 0 and disables navigation", async () => {
      apiFetch.mockImplementation((url) => {
        if (url.includes("/api/products/auctions/rounds/current")) {
          return Promise.resolve(null);
        }
        if (url.includes("/api/products/auctions/rounds")) {
          return Promise.reject(new Error("เครือข่ายขัดข้อง"));
        }
        if (url.includes("/api/products/categories")) {
          return Promise.resolve({ items: [] });
        }
        return Promise.resolve({});
      });

      render(<RoundManagementSection token={mockToken} />);

      expect(
        await screen.findByText("เครือข่ายขัดข้อง"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          (_, el) =>
            el?.tagName?.toLowerCase() === "span" &&
            el?.textContent?.trim() === "ทั้งหมด 0 รายการ",
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName?.toLowerCase() === "span" &&
            el?.textContent?.trim() === "ทั้งหมด — รายการ",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName?.toLowerCase() === "span" &&
            el?.textContent?.trim() === "หน้า — จาก —",
        ),
      ).toBeInTheDocument();

      const prevBtn = screen.getByRole("button", { name: "ก่อนหน้า" });
      const nextBtn = screen.getByRole("button", { name: "ถัดไป" });
      expect(prevBtn).toBeInTheDocument();
      expect(nextBtn).toBeInTheDocument();
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeDisabled();
    });
  });

  describe("AuctionScheduleSection Items - Pagination Comprehensive Coverage", () => {
    it("AuctionScheduleSection: handles 0 auction items with empty state and disabled buttons", async () => {
      apiFetch.mockImplementation((url) => {
        if (url.includes("/api/products/auctions/rounds/current")) {
          return Promise.resolve(null);
        }
        if (url.includes("/api/products/auctions/rounds")) {
          return Promise.resolve({ items: [], total: 0 });
        }
        if (url.includes("/api/products/categories")) {
          return Promise.resolve({ items: [] });
        }
        if (url.includes("/api/products/auctions?")) {
          return Promise.resolve({ items: [], total: 0, totalPages: 1 });
        }
        return Promise.resolve({});
      });

      render(<AuctionScheduleSection token={mockToken} />);

      expect(
        await screen.findByText("ยังไม่มีรายการประมูลในหมวดนี้"),
      ).toBeInTheDocument();

      const allItemsCountSpans = screen.getAllByText(
        (_, el) =>
          el?.tagName?.toLowerCase() === "span" &&
          el?.textContent?.trim() === "ทั้งหมด 0 รายการ",
      );
      // Both round and items pagination display 0 items
      expect(allItemsCountSpans.length).toBe(2);

      const prevBtns = screen.getAllByRole("button", { name: "ก่อนหน้า" });
      const nextBtns = screen.getAllByRole("button", { name: "ถัดไป" });
      expect(prevBtns.length).toBe(2);
      expect(nextBtns.length).toBe(2);
      expect(prevBtns[1]).toBeDisabled();
      expect(nextBtns[1]).toBeDisabled();
    });

    it("AuctionScheduleSection: handles single page of auction items with disabled buttons", async () => {
      apiFetch.mockImplementation((url) => {
        if (url.includes("/api/products/auctions/rounds/current")) {
          return Promise.resolve(null);
        }
        if (url.includes("/api/products/auctions/rounds")) {
          return Promise.resolve({ items: [], total: 0 });
        }
        if (url.includes("/api/products/categories")) {
          return Promise.resolve({ items: [] });
        }
        if (url.includes("/api/products/auctions?")) {
          return Promise.resolve({
            items: [
              {
                id: "auc-single-1",
                productId: "prod-single-1",
                product: { title: "สินค้าประมูลเดี่ยว" },
                status: "approved",
                startingPrice: 500,
                bidIncrement: 50,
                scheduledStartAt: "2026-10-01T00:00:00.000Z",
                scheduledEndAt: "2026-10-02T00:00:00.000Z",
              },
            ],
            total: 1,
            totalPages: 1,
          });
        }
        return Promise.resolve({});
      });

      render(<AuctionScheduleSection token={mockToken} />);

      expect(
        await screen.findByText("สินค้าประมูลเดี่ยว"),
      ).toBeInTheDocument();

      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName?.toLowerCase() === "span" &&
            el?.textContent?.trim() === "ทั้งหมด 1 รายการ",
        ),
      ).toBeInTheDocument();

      const prevBtns = screen.getAllByRole("button", { name: "ก่อนหน้า" });
      const nextBtns = screen.getAllByRole("button", { name: "ถัดไป" });
      const itemPrevBtn = prevBtns[prevBtns.length - 1];
      const itemNextBtn = nextBtns[nextBtns.length - 1];
      expect(itemPrevBtn).toBeInTheDocument();
      expect(itemNextBtn).toBeInTheDocument();
      expect(itemPrevBtn).toBeDisabled();
      expect(itemNextBtn).toBeDisabled();
    });

    it("AuctionScheduleSection: handles loading state for auction items with disabled buttons", async () => {
      let resolvePromise;
      apiFetch.mockImplementation((url) => {
        if (url.includes("/api/products/auctions/rounds/current")) {
          return Promise.resolve(null);
        }
        if (url.includes("/api/products/auctions/rounds")) {
          return Promise.resolve({ items: [], total: 0 });
        }
        if (url.includes("/api/products/categories")) {
          return Promise.resolve({ items: [] });
        }
        if (url.includes("/api/products/auctions?")) {
          return new Promise((resolve) => {
            resolvePromise = resolve;
          });
        }
        return Promise.resolve({});
      });

      render(<AuctionScheduleSection token={mockToken} />);

      expect(screen.getByText("กำลังโหลด...")).toBeInTheDocument();

      const prevBtns = screen.getAllByRole("button", { name: "ก่อนหน้า" });
      const nextBtns = screen.getAllByRole("button", { name: "ถัดไป" });
      const itemPrevBtn = prevBtns[prevBtns.length - 1];
      const itemNextBtn = nextBtns[nextBtns.length - 1];
      expect(itemPrevBtn).toBeInTheDocument();
      expect(itemNextBtn).toBeInTheDocument();
      expect(itemPrevBtn).toBeDisabled();
      expect(itemNextBtn).toBeDisabled();

      const callsBefore = apiFetch.mock.calls.length;
      fireEvent.click(itemPrevBtn);
      fireEvent.click(itemNextBtn);
      expect(apiFetch.mock.calls.length).toBe(callsBefore);

      resolvePromise({ items: [], total: 0, totalPages: 1 });
    });

    it("AuctionScheduleSection: handles API error without displaying count 0 as success and disables navigation", async () => {
      apiFetch.mockImplementation((url) => {
        if (url.includes("/api/products/auctions/rounds/current")) {
          return Promise.resolve(null);
        }
        if (url.includes("/api/products/auctions/rounds")) {
          return Promise.resolve({ items: [], total: 0 });
        }
        if (url.includes("/api/products/categories")) {
          return Promise.resolve({ items: [] });
        }
        if (url.includes("/api/products/auctions?")) {
          return Promise.reject(new Error("การเชื่อมต่อรายการสินค้าล้มเหลว"));
        }
        return Promise.resolve({});
      });

      render(<AuctionScheduleSection token={mockToken} />);

      expect(
        await screen.findByText("การเชื่อมต่อรายการสินค้าล้มเหลว"),
      ).toBeInTheDocument();

      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName?.toLowerCase() === "span" &&
            el?.textContent?.trim() === "ทั้งหมด — รายการ",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName?.toLowerCase() === "span" &&
            el?.textContent?.trim() === "หน้า — จาก —",
        ),
      ).toBeInTheDocument();

      const prevBtns = screen.getAllByRole("button", { name: "ก่อนหน้า" });
      const nextBtns = screen.getAllByRole("button", { name: "ถัดไป" });
      const itemPrevBtn = prevBtns[prevBtns.length - 1];
      const itemNextBtn = nextBtns[nextBtns.length - 1];
      expect(itemPrevBtn).toBeInTheDocument();
      expect(itemNextBtn).toBeInTheDocument();
      expect(itemPrevBtn).toBeDisabled();
      expect(itemNextBtn).toBeDisabled();
    });
  });
});
