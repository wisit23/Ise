import {
  render,
  screen,
  act,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import NavBar from "./NavBar";
import { getUnreadCount } from "../lib/chat";
import {
  getAccessToken,
  getAccessTokenClaims,
  getStoredUser,
  getCurrentRoles,
  clearSession,
} from "../lib/auth";
import { apiFetch } from "../lib/api";

jest.mock("../lib/api", () => ({
  apiFetch: jest.fn().mockResolvedValue({ total: 0 }),
  mediaUrl: (url) => url,
}));

jest.mock("../lib/catalog", () => ({
  fetchActiveCategories: jest.fn().mockResolvedValue([]),
}));

jest.mock("../lib/chat", () => ({ getUnreadCount: jest.fn() }));

jest.mock("../lib/auth", () => {
  const actual = jest.requireActual("../lib/auth");
  return {
    ...actual,
    getAccessToken: jest.fn(),
    getAccessTokenClaims: jest.fn(),
    getStoredUser: jest.fn(),
    getCurrentRoles: jest.fn(),
    clearSession: jest.fn(),
  };
});

const mockSocketState = { socket: null, connected: false };

jest.mock("./chat/ChatSocketProvider", () => {
  const { useEffect, useRef } = require("react");
  return {
    useChatSocket: () => mockSocketState,
    useChatSocketEvent: (event, handler) => {
      const handlerRef = useRef(handler);
      handlerRef.current = handler;
      const socket = mockSocketState.socket;
      useEffect(() => {
        if (!socket) return undefined;
        const listener = (...args) => handlerRef.current?.(...args);
        socket.on(event, listener);
        return () => socket.off(event, listener);
      }, [socket, event]);
    },
  };
});

function createFakeSocket() {
  const handlers = new Map();
  return {
    on: jest.fn((event, cb) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(cb);
    }),
    off: jest.fn((event, cb) => handlers.get(event)?.delete(cb)),
    close: jest.fn(),
    _trigger: (event, payload) => {
      for (const cb of handlers.get(event) || []) cb(payload);
    },
  };
}

function mockBuyer() {
  getStoredUser.mockReturnValue({
    id: "buyer-1",
    firstName: "ผู้ซื้อ",
    role: "BUYER",
  });
  getAccessToken.mockReturnValue("token-123");
  getAccessTokenClaims.mockReturnValue({});
  getCurrentRoles.mockReturnValue(["BUYER"]);
  getUnreadCount.mockResolvedValue({ total: 0 });
}

describe("NavBar role permissions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketState.socket = null;
    mockSocketState.connected = false;
    mockBuyer();
  });

  it("shows an executive only their work menu and logout", () => {
    getStoredUser.mockReturnValue({
      id: "exec-1",
      firstName: "Executive",
      role: "EXECUTIVE",
    });
    getCurrentRoles.mockReturnValue(["EXECUTIVE"]);
    render(<NavBar />);

    expect(
      screen.queryByRole("link", { name: /^ตะกร้า/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^ข้อความ/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^ลงขาย$/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "เมนูโปรไฟล์" }));

    expect(
      screen.getByRole("link", { name: "แดชบอร์ดผู้บริหาร" }),
    ).toBeInTheDocument();
    for (const customerMenu of [
      "ลงขายสินค้า",
      "คำสั่งซื้อของฉัน",
      "คูปองส่วนลดของฉัน",
      "ตั๋วแจ้งปัญหาของฉัน",
      "ศูนย์ช่วยเหลือ",
      "ตั้งค่าโปรไฟล์",
    ]) {
      expect(
        screen.queryByRole("link", { name: customerMenu }),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "ออกจากระบบ" }),
    ).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(getUnreadCount).not.toHaveBeenCalled();
  });

  it("keeps customer account menus and shortcuts for buyers", async () => {
    render(<NavBar />);

    expect(
      await screen.findByRole("link", { name: /^ลงขาย$/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^ตะกร้า/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^ข้อความ/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "เมนูโปรไฟล์" }));

    for (const customerMenu of [
      "ลงขายสินค้า",
      "คำสั่งซื้อของฉัน",
      "คูปองส่วนลดของฉัน",
      "ตั๋วแจ้งปัญหาของฉัน",
      "ศูนย์ช่วยเหลือ",
      "ตั้งค่าโปรไฟล์",
    ]) {
      expect(
        screen.getByRole("link", { name: customerMenu }),
      ).toBeInTheDocument();
    }
  });

  it("keeps seller work menus together with customer account menus", async () => {
    getStoredUser.mockReturnValue({
      id: "seller-1",
      firstName: "Seller",
      role: "SELLER",
    });
    getCurrentRoles.mockReturnValue(["SELLER"]);
    getAccessTokenClaims.mockReturnValue({ kycStatus: "VERIFIED" });

    render(<NavBar />);

    fireEvent.click(await screen.findByRole("button", { name: "เมนูโปรไฟล์" }));

    for (const sellerMenu of [
      "แดชบอร์ดผู้ขาย",
      "ร้านค้าของฉัน",
      "อัปโหลดคลิปรีวิว",
      "ส่งสินค้าประมูล",
      "ลงขายสินค้า",
      "คำสั่งซื้อของฉัน",
      "คูปองส่วนลดของฉัน",
    ]) {
      expect(
        screen.getByRole("link", { name: sellerMenu }),
      ).toBeInTheDocument();
    }
  });
});

describe("NavBar unread badge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketState.socket = null;
    mockSocketState.connected = false;
    mockBuyer();
  });

  it("shows no badge when there is nothing unread", async () => {
    render(<NavBar />);

    const link = await screen.findByRole("link", { name: /^ข้อความ$/ });
    expect(link).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /ยังไม่อ่าน/ }),
    ).not.toBeInTheDocument();
  });

  it("renders the unread total it loads on mount", async () => {
    getUnreadCount.mockResolvedValue({ total: 3 });

    render(<NavBar />);

    expect(
      await screen.findByRole("link", { name: /มี 3 รายการที่ยังไม่อ่าน/ }),
    ).toBeInTheDocument();
  });

  it("updates the badge live on a pushed activity event", async () => {
    const fakeSocket = createFakeSocket();
    mockSocketState.socket = fakeSocket;
    mockSocketState.connected = true;

    render(<NavBar />);
    await screen.findByRole("link", { name: /^ข้อความ$/ });

    getUnreadCount.mockResolvedValue({ total: 1 });
    act(() =>
      fakeSocket._trigger("conversation:activity", {
        conversationId: "c-1",
        messageId: "m-1",
        senderId: "seller-1",
      }),
    );

    expect(
      await screen.findByRole("link", { name: /มี 1 รายการที่ยังไม่อ่าน/ }),
    ).toBeInTheDocument();
  });

  it("re-reads the total when the socket reconnects", async () => {
    const fakeSocket = createFakeSocket();
    mockSocketState.socket = fakeSocket;
    mockSocketState.connected = false;

    const { rerender } = render(<NavBar />);
    await screen.findByRole("link", { name: /^ข้อความ$/ });

    getUnreadCount.mockResolvedValue({ total: 5 });
    mockSocketState.connected = true;
    rerender(<NavBar />);

    expect(
      await screen.findByRole("link", { name: /มี 5 รายการที่ยังไม่อ่าน/ }),
    ).toBeInTheDocument();
  });

  it("updates the badge when a local chat sync event is dispatched", async () => {
    getUnreadCount.mockResolvedValue({ total: 2 });

    render(<NavBar />);
    expect(
      await screen.findByRole("link", { name: /มี 2 รายการที่ยังไม่อ่าน/ }),
    ).toBeInTheDocument();

    getUnreadCount.mockResolvedValue({ total: 0 });
    act(() => {
      window.dispatchEvent(new CustomEvent("chat:unread-sync"));
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("link", { name: /ยังไม่อ่าน/ }),
      ).not.toBeInTheDocument();
    });
  });

  it("never asks for an unread count when nobody is logged in", async () => {
    getAccessToken.mockReturnValue(null);
    getStoredUser.mockReturnValue(null);
    getCurrentRoles.mockReturnValue([]);

    render(<NavBar />);

    await waitFor(() => expect(getUnreadCount).not.toHaveBeenCalled());
  });
});

describe("NavBar responsive navigation and dropdowns", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketState.socket = null;
    mockSocketState.connected = false;
    mockBuyer();
  });

  it("applies responsive breakpoint classes for desktop discovery nav and mobile toggle", () => {
    render(<NavBar />);

    const desktopNav = screen.getByRole("navigation", { name: "สำรวจสินค้า" });
    expect(desktopNav).toHaveClass("hidden");
    expect(desktopNav).toHaveClass("xl:flex");

    const hamburger = screen.getByRole("button", { name: "เมนูหลัก" });
    expect(hamburger).toHaveClass("xl:hidden");

    expect(screen.getByRole("link", { name: "ปัดดู" })).toHaveAttribute(
      "href",
      "/swipe",
    );
    expect(screen.getByRole("link", { name: "คูปอง" })).toHaveAttribute(
      "href",
      "/campaigns",
    );
    expect(screen.getByRole("link", { name: "ประมูล" })).toHaveAttribute(
      "href",
      "/auctions",
    );
    expect(screen.getByRole("link", { name: "บทความ" })).toHaveAttribute(
      "href",
      "/articles",
    );
  });

  it("toggles the mobile drawer when clicking the hamburger button", async () => {
    render(<NavBar />);

    const toggleButton = screen.getByRole("button", { name: "เมนูหลัก" });
    expect(toggleButton).toBeInTheDocument();
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("mobile-nav-drawer")).not.toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("mobile-nav-drawer")).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "ลงขายสินค้าของคุณ" }),
    ).toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("mobile-nav-drawer")).not.toBeInTheDocument();
  });

  it("opens profile dropdown, supports scroll and outside click dismissal", () => {
    render(<NavBar />);

    const profileButton = screen.getByRole("button", { name: "เมนูโปรไฟล์" });
    expect(profileButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(profileButton);
    expect(profileButton).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveClass("overflow-y-auto");
    expect(menu).toHaveClass("max-h-[calc(100vh-4.75rem)]");

    // All links and logout are present
    expect(
      screen.getByRole("link", { name: "ลงขายสินค้า" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "คำสั่งซื้อของฉัน" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "คูปองส่วนลดของฉัน" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "ตั๋วแจ้งปัญหาของฉัน" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "ศูนย์ช่วยเหลือ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "ตั้งค่าโปรไฟล์" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ออกจากระบบ" }),
    ).toBeInTheDocument();

    // Click outside dismisses menu
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes open menus when Escape is pressed", () => {
    render(<NavBar />);

    // Test mobile drawer Escape
    const hamburger = screen.getByRole("button", { name: "เมนูหลัก" });
    fireEvent.click(hamburger);
    expect(screen.getByTestId("mobile-nav-drawer")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("mobile-nav-drawer")).not.toBeInTheDocument();

    // Test profile dropdown Escape
    const profileButton = screen.getByRole("button", { name: "เมนูโปรไฟล์" });
    fireEvent.click(profileButton);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("handles logout properly from profile dropdown", () => {
    delete window.location;
    window.location = new URL("http://localhost/");

    render(<NavBar />);

    fireEvent.click(screen.getByRole("button", { name: "เมนูโปรไฟล์" }));
    const logoutBtn = screen.getByRole("button", { name: "ออกจากระบบ" });
    fireEvent.click(logoutBtn);

    expect(clearSession).toHaveBeenCalled();
  });
});
