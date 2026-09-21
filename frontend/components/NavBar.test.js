import { render, screen, fireEvent } from "@testing-library/react";
import NavBar from "./NavBar";
import {
  getAccessToken,
  getAccessTokenClaims,
  getStoredUser,
  getCurrentRoles,
} from "../lib/auth";
import { apiFetch } from "../lib/api";

jest.mock("../lib/api", () => ({
  apiFetch: jest.fn().mockResolvedValue({ total: 0 }),
  mediaUrl: (url) => url,
}));

jest.mock("../lib/catalog", () => ({
  fetchActiveCategories: jest.fn().mockResolvedValue([]),
}));

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

describe("NavBar role permissions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getStoredUser.mockReturnValue({
      id: "buyer-1",
      firstName: "ผู้ซื้อ",
      role: "BUYER",
    });
    getAccessToken.mockReturnValue("token-123");
    getAccessTokenClaims.mockReturnValue({});
    getCurrentRoles.mockReturnValue(["BUYER"]);
  });

  it("shows an executive only their work menu and logout", async () => {
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
      screen.queryByRole("link", { name: /^ลงขาย$/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "เมนูโปรไฟล์" }));

    expect(
      screen.getByRole("link", { name: "แดชบอร์ดผู้บริหาร" }),
    ).toBeInTheDocument();
    for (const customerMenu of [
      "ลงขายสินค้า",
      "คำสั่งซื้อของฉัน",
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
  });

  it("keeps customer account menus and the sell shortcut for buyers", async () => {
    render(<NavBar />);

    expect(
      await screen.findByRole("link", { name: /^ลงขาย$/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "เมนูโปรไฟล์" }));

    for (const customerMenu of [
      "ลงขายสินค้า",
      "คำสั่งซื้อของฉัน",
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
    ]) {
      expect(
        screen.getByRole("link", { name: sellerMenu }),
      ).toBeInTheDocument();
    }
  });
});
