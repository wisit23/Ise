import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import DayField from "./DayField";

// The page keeps the day in state and hands it back, as OverviewSection does.
function Harness({ onChange, ...props }) {
  const [value, setValue] = useState("2026-10-16");
  return (
    <DayField
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      max="2026-10-16"
      label="เลือกวันที่"
      {...props}
    />
  );
}

function setup(props = {}) {
  const onChange = jest.fn();
  render(<Harness onChange={onChange} {...props} />);
  return { onChange, field: screen.getByLabelText("เลือกวันที่") };
}

describe("DayField", () => {
  it("shows the day as day/month/Buddhist year", () => {
    const { field } = setup();
    expect(field).toHaveValue("16/10/2569");
  });

  it("reports a finished date as ISO and nothing while it is unfinished", () => {
    const { onChange, field } = setup();

    fireEvent.change(field, { target: { value: "17" } });
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(field).toHaveValue("17");

    fireEvent.change(field, { target: { value: "17102568" } });
    expect(field).toHaveValue("17/10/2568");
    expect(onChange).toHaveBeenLastCalledWith("2025-10-17");
  });

  it("reports a date that does not exist as not chosen", () => {
    const { onChange, field } = setup();
    fireEvent.change(field, { target: { value: "31/02/2569" } });
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("shows an error only once the date is finished", () => {
    const { field } = setup({ error: "เลือกวันที่ในอนาคตไม่ได้" });
    fireEvent.change(field, { target: { value: "1" } });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.change(field, { target: { value: "17/10/2569" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "เลือกวันที่ในอนาคตไม่ได้",
    );
  });

  it("has a calendar button", () => {
    setup();
    expect(screen.getByRole("button", { name: "เปิดปฏิทิน" })).toBeVisible();
  });
});
