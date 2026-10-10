import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MessageComposer from "./MessageComposer";
import defaults from "../../lib/customerServiceConfig";
import { apiFetch } from "../../lib/api";
jest.mock("../../lib/api", () => ({ apiFetch: jest.fn() }));

test("composer reads the server limit and trims typed messages to that limit", async () => {
  apiFetch.mockResolvedValue({
    ...defaults,
    chat: { ...defaults.chat, maxMessageLength: 32 },
  });
  const onSend = jest.fn().mockResolvedValue(undefined);
  render(<MessageComposer onSend={onSend} />);
  const input = screen.getByLabelText("พิมพ์ข้อความ");
  await waitFor(() => expect(input).toHaveAttribute("maxlength", "32"));
  fireEvent.change(input, { target: { value: "x".repeat(40) } });
  fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
  await waitFor(() => expect(onSend).toHaveBeenCalledWith("x".repeat(32)));
});

test("unsupported files are rejected before upload and existing text is preserved", async () => {
  apiFetch.mockResolvedValue(defaults);
  const onAttach = jest.fn();
  const view = render(
    <MessageComposer onSend={jest.fn()} onAttach={onAttach} />,
  );
  const input = screen.getByLabelText("พิมพ์ข้อความ");
  fireEvent.change(input, { target: { value: "draft stays" } });
  const file = new File(["bad"], "bad.exe", {
    type: "application/x-msdownload",
  });
  fireEvent.change(view.container.querySelector('input[type="file"]'), {
    target: { files: [file] },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("เลือกไฟล์ชนิดที่รองรับ");
  expect(input).toHaveValue("draft stays");
  expect(onAttach).not.toHaveBeenCalled();
});
