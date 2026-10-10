import { isReservationExpired, reservationCountdown } from "./page";

test("shows the persisted reservation countdown and detects expiry", () => {
  const order = { reservationExpiresAt: "2026-08-10T12:10:00.000Z" };

  expect(
    reservationCountdown(order, new Date("2026-08-10T12:00:30.000Z").getTime()),
  ).toBe("9:30");
  expect(
    isReservationExpired(order, new Date("2026-08-10T12:09:59.000Z").getTime()),
  ).toBe(false);
  expect(
    isReservationExpired(order, new Date("2026-08-10T12:10:00.000Z").getTime()),
  ).toBe(true);
});

test("keeps legacy cart rows without an expiry usable", () => {
  const legacyOrder = { reservationExpiresAt: null };

  expect(isReservationExpired(legacyOrder, Date.now())).toBe(false);
  expect(reservationCountdown(legacyOrder, Date.now())).toBeNull();
});

test("auction won orders have a 24-hour payment window", () => {
  const auctionOrder = {
    auctionId: "auction-123",
    createdAt: "2026-08-10T12:00:00.000Z",
    reservationExpiresAt: null,
  };

  expect(
    isReservationExpired(
      auctionOrder,
      new Date("2026-08-10T12:15:00.000Z").getTime(),
    ),
  ).toBe(false);

  expect(
    isReservationExpired(
      auctionOrder,
      new Date("2026-08-11T12:01:00.000Z").getTime(),
    ),
  ).toBe(true);
});
