import { act, render, screen } from "@testing-library/react";
import CartPage from "./page";
import { apiFetch } from "../../lib/api";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../../components/NavBar", () => () => <nav />);
jest.mock("../../components/Footer", () => () => <footer />);
jest.mock("../../lib/auth", () => ({ getAccessToken: () => "token" }));
jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));

describe("CartPage", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-26T00:00:00.000Z"));
    apiFetch.mockResolvedValue({
      items: [
        {
          id: "order-1",
          productTitle: "สินค้าเดโม",
          price: 199,
          createdAt: "2026-08-26T00:00:00.000Z",
          reservationExpiresAt: "2026-08-26T00:09:05.000Z",
        },
      ],
    });
  });

  afterEach(() => jest.useRealTimers());

  it("shows the live time remaining from the reservation expiry", async () => {
    render(<CartPage />);

    expect(
      await screen.findByText("เหลือเวลาชำระเงิน 9:05 นาที"),
    ).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1000));
    expect(
      await screen.findByText("เหลือเวลาชำระเงิน 9:04 นาที"),
    ).toBeInTheDocument();
  });
});
