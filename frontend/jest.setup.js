/* global jest */

require("@testing-library/jest-dom");

// jsdom does not implement media playback. These mocks keep component tests
// focused on our play/pause decisions instead of browser codecs.
Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
  configurable: true,
  value: jest.fn().mockResolvedValue(undefined),
});
Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
  configurable: true,
  value: jest.fn(),
});
