import { formatCheckoutCountdown, remainingSeconds } from "./checkout";

test("formats a server deadline as a checkout countdown", () => {
  expect(
    remainingSeconds(
      "2026-08-10T12:10:00.000Z",
      new Date("2026-08-10T12:00:30.000Z").getTime(),
    ),
  ).toBe(570);
  expect(formatCheckoutCountdown(570)).toBe("09:30");
  expect(formatCheckoutCountdown(0)).toBe("00:00");
});
