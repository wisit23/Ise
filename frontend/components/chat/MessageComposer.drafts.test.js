import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import MessageComposer from "./MessageComposer";
beforeEach(() => sessionStorage.clear());
test("persisted composer restores focus after send and accepts the next message", async () => {
  let finish;
  const onSend = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  render(<MessageComposer draftKey="tickets:focus" onSend={onSend} />);
  const input = screen.getByLabelText("พิมพ์ข้อความ");
  input.focus();
  fireEvent.change(input, { target: { value: "first" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(input).toBeDisabled();
  await act(async () => finish());
  expect(input).toBeEnabled();
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: "second" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onSend).toHaveBeenLastCalledWith("second");
  await act(async () => finish());
});
test("typing refreshes during a long burst and stops on unmount", () => {
  jest.useFakeTimers();
  const onTyping = jest.fn();
  const { unmount } = render(<MessageComposer onSend={jest.fn()} onTyping={onTyping} />);
  const input = screen.getByLabelText("พิมพ์ข้อความ");
  fireEvent.change(input, { target: { value: "a" } });
  act(() => jest.advanceTimersByTime(1600));
  fireEvent.change(input, { target: { value: "ab" } });
  expect(onTyping.mock.calls).toEqual([[true], [true]]);
  unmount();
  expect(onTyping).toHaveBeenLastCalledWith(false);
  jest.useRealTimers();
});
test("private party drafts remain separate after unmount and remount", () => {
  let instance = render(
    <MessageComposer draftKey="disputes:a:buyer" onSend={jest.fn()} />,
  );
  fireEvent.change(screen.getByLabelText("พิมพ์ข้อความ"), {
    target: { value: "buyer draft" },
  });
  instance.unmount();
  instance = render(
    <MessageComposer draftKey="disputes:a:seller" onSend={jest.fn()} />,
  );
  expect(screen.getByLabelText("พิมพ์ข้อความ")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("พิมพ์ข้อความ"), {
    target: { value: "seller draft" },
  });
  instance.unmount();
  render(<MessageComposer draftKey="disputes:a:buyer" onSend={jest.fn()} />);
  expect(screen.getByLabelText("พิมพ์ข้อความ")).toHaveValue("buyer draft");
});
test("a failed send after navigation cannot lose the saved draft", async () => {
  let rejectSend;
  const instance = render(
    <MessageComposer
      draftKey="tickets:a:requester"
      onSend={() =>
        new Promise((_, reject) => {
          rejectSend = reject;
        })
      }
    />,
  );
  fireEvent.change(screen.getByLabelText("พิมพ์ข้อความ"), {
    target: { value: "keep after failed send" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
  await waitFor(() =>
    expect(screen.getByLabelText("พิมพ์ข้อความ")).toBeDisabled(),
  );
  instance.unmount();
  await act(async () => rejectSend(new Error("network unavailable")));
  render(<MessageComposer draftKey="tickets:a:requester" onSend={jest.fn()} />);
  expect(screen.getByLabelText("พิมพ์ข้อความ")).toHaveValue(
    "keep after failed send",
  );
});
