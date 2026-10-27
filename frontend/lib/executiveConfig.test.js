const keys = [
  "NEXT_PUBLIC_REPORT_SEARCH_DEBOUNCE_MS",
  "NEXT_PUBLIC_REPORT_REQUEST_TIMEOUT_MS",
  "NEXT_PUBLIC_REPORT_TIMEZONE",
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
beforeEach(() => keys.forEach((key) => delete process.env[key]));
afterEach(() =>
  keys.forEach((key) => {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }),
);
const readConfig = () => {
  let config;
  jest.isolateModules(() => {
    config = require("./executiveConfig");
  });
  return config;
};
test("reads Executive configuration from environment with validated defaults", () => {
  expect(readConfig()).toMatchObject({
    EXECUTIVE_SEARCH_DELAY_MS: 300,
    EXECUTIVE_REQUEST_TIMEOUT_MS: 15000,
    EXECUTIVE_TIMEZONE: "Asia/Bangkok",
  });
  process.env.NEXT_PUBLIC_REPORT_SEARCH_DEBOUNCE_MS = "450";
  process.env.NEXT_PUBLIC_REPORT_REQUEST_TIMEOUT_MS = "12000";
  process.env.NEXT_PUBLIC_REPORT_TIMEZONE = "UTC";
  expect(readConfig()).toMatchObject({
    EXECUTIVE_SEARCH_DELAY_MS: 450,
    EXECUTIVE_REQUEST_TIMEOUT_MS: 12000,
    EXECUTIVE_TIMEZONE: "UTC",
  });
});
test.each([
  [keys[0], "invalid"],
  [keys[0], "2001"],
  [keys[1], "0"],
  [keys[1], "60001"],
  [keys[1], "1500.5"],
  [keys[2], "invalid-zone"],
])("rejects invalid configuration %s=%s", (key, value) => {
  process.env[key] = value;
  expect(readConfig).toThrow(key);
});
