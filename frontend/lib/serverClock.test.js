import { remainingSeconds, formatCheckoutCountdown } from "./checkout";

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test.each([-3000, 3000, -120000])(
  "a browser clock offset of %i ms does not extend or shorten checkout",
  (offset) => {
    jest.useFakeTimers();
    const start = Date.parse("2026-10-28T12:00:00.000Z");
    jest.setSystemTime(start + offset);
    jest.isolateModules(() => {
      const { syncServerClock, serverNow } = require("./serverClock");
      syncServerClock(new Date(start).toISOString());
      const deadline = new Date(start + 600000).toISOString();
      expect(formatCheckoutCountdown(remainingSeconds(deadline, serverNow()))).toBe("10:00");
      jest.advanceTimersByTime(3000);
      expect(formatCheckoutCountdown(remainingSeconds(deadline, serverNow()))).toBe("09:57");
      jest.setSystemTime(start - 3600000);
      expect(remainingSeconds(deadline, serverNow())).toBe(597);
      jest.advanceTimersByTime(597000);
      expect(remainingSeconds(deadline, serverNow())).toBe(0);
    });
  },
);

test("missing or invalid server timestamps preserve the last valid clock", () => {
  jest.useFakeTimers();
  jest.setSystemTime(1000);
  jest.isolateModules(() => {
    const { syncServerClock, serverNow } = require("./serverClock");
    expect(serverNow()).toBe(1000);
    syncServerClock("2026-10-28T12:00:00.000Z");
    const synced = serverNow();
    syncServerClock(null);
    syncServerClock("invalid");
    expect(serverNow()).toBe(synced);
  });
});
