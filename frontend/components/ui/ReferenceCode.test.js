import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReferenceCode from "./ReferenceCode";

test("copy exactly the persisted code, not the internal ID", async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(
    <ReferenceCode
      value={{ id: "private-internal-id", referenceCode: "ORD-7K3M-9X2R-4T6W" }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "คัดลอกรหัส ORD-7K3M-9X2R-4T6W" }),
  );
  await waitFor(() =>
    expect(screen.getByText("คัดลอกแล้ว")).toBeInTheDocument(),
  );
  expect(writeText).toHaveBeenCalledWith("ORD-7K3M-9X2R-4T6W");
});

test("show an actionable message if clipboard access is unavailable", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  render(<ReferenceCode value={{ id: "full-legacy-id" }} />);
  fireEvent.click(screen.getByRole("button"));
  expect(await screen.findByRole("status")).toHaveTextContent("คัดลอกไม่ได้");
  expect(screen.getByText("full-legacy-id")).toBeInTheDocument();
});
