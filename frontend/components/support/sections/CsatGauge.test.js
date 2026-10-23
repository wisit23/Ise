import { act, render, screen } from "@testing-library/react";
import CsatGauge, { combineCsat } from "./CsatGauge";
const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  jest.restoreAllMocks();
});
test("combines raw response counts with correct weighting", () => {
  expect(
    combineCsat([
      { total: 1, satisfied: 1, scoreSum: 5 },
      { total: 9, satisfied: 0, scoreSum: 9 },
    ]),
  ).toMatchObject({ total: 10, percent: 10, average: "1.4" });
});
test("shows empty state instead of inventing a score", () => {
  const empty = { total: 0, satisfied: 0, scoreSum: 0 };
  render(<CsatGauge tickets={empty} disputes={empty} days={7} />);
  expect(screen.getByText("ยังไม่มีผู้ประเมินในช่วงนี้")).toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    "ยังไม่มีคะแนน CSAT",
  );
});
test("renders the combined percent and response count", () => {
  render(
    <CsatGauge
      tickets={{ total: 4, satisfied: 3, scoreSum: 16 }}
      disputes={{ total: 1, satisfied: 1, scoreSum: 5 }}
      days={7}
    />,
  );
  expect(screen.getByLabelText("80%")).toBeInTheDocument();
  expect(screen.getByText("พึงพอใจ").parentElement).toHaveTextContent("4 / 5");
  expect(screen.getByText("คะแนนเฉลี่ย").parentElement).toHaveTextContent(
    "4.2 / 5",
  );
  expect(screen.getByLabelText("คำตอบทั้งหมด 5 คำตอบ")).toHaveTextContent(
    "Ticket 4",
  );
});

test("waits for the auth entrance, counts once, and keeps the final value on refresh", () => {
  window.matchMedia = jest.fn(() => ({ matches: false }));
  let tick;
  const raf = jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      tick = callback;
      return 1;
    });
  const source = { total: 4, satisfied: 3, scoreSum: 16 };
  const props = { tickets: source, disputes: source, days: 14 };
  const { container, rerender } = render(
    <CsatGauge {...props} entering paused />,
  );
  expect(raf).not.toHaveBeenCalled();
  rerender(<CsatGauge {...props} entering />);
  expect(container.querySelector("[data-animated-number]")).toHaveTextContent(
    "0",
  );
  act(() => tick(performance.now() + 1200));
  expect(container.querySelector("[data-animated-number]")).toHaveTextContent(
    "75",
  );
  raf.mockClear();
  rerender(<CsatGauge {...props} />);
  expect(raf).not.toHaveBeenCalled();
  expect(container.querySelector("[data-animated-number]")).toHaveTextContent(
    "75",
  );
});

test("reduced motion shows the final percentage without starting a counter", () => {
  window.matchMedia = jest.fn(() => ({ matches: true }));
  const raf = jest.spyOn(window, "requestAnimationFrame");
  const source = { total: 1, satisfied: 1, scoreSum: 5 };
  const { container } = render(
    <CsatGauge tickets={source} disputes={source} days={7} entering />,
  );
  expect(raf).not.toHaveBeenCalled();
  expect(container.querySelector("[data-animated-number]")).toHaveTextContent(
    "100",
  );
});
