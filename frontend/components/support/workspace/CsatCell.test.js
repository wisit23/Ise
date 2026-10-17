import { render, screen } from "@testing-library/react";
import CsatCell from "./CsatCell";

test("shows the average and each party's stars for a dispute", () => {
  render(
    <CsatCell
      ratings={[
        { respondentSide: "BUYER", rating: 5, comment: "ตอบไวมาก" },
        { respondentSide: "SELLER", rating: 3, comment: "" },
      ]}
    />,
  );
  expect(screen.getByLabelText("คะแนนเฉลี่ย 4.0 จาก 5 ดาว")).toBeInTheDocument();
  expect(screen.getByText("ผู้ซื้อ")).toBeInTheDocument();
  expect(screen.getByText("★ 5")).toBeInTheDocument();
  expect(screen.getByText("★ 3")).toBeInTheDocument();
  expect(screen.getByText("“ตอบไวมาก”")).toBeInTheDocument();
});

test("a single ticket rating shows stars without party chips", () => {
  render(<CsatCell ratings={[{ respondentSide: "REQUESTER", rating: 2, comment: "" }]} />);
  expect(screen.getByText("2.0")).toBeInTheDocument();
  expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
});

test("unrated case says so", () => {
  render(<CsatCell ratings={[]} />);
  expect(screen.getByText("ยังไม่ได้ประเมิน")).toBeInTheDocument();
});
