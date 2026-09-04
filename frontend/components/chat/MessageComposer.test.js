import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MessageComposer from "./MessageComposer";
import { MAX_MESSAGE_LENGTH } from "../../lib/chat";

describe("MessageComposer", () => {
  it("does not call onSend for an empty or whitespace-only message", () => {
    const onSend = jest.fn();
    render(<MessageComposer onSend={onSend} />);

    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("พิมพ์ข้อความ"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends the trimmed message and clears the input afterward", async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={onSend} />);

    const textarea = screen.getByLabelText("พิมพ์ข้อความ");
    fireEvent.change(textarea, { target: { value: "  สวัสดีครับ  " } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith("สวัสดีครับ"));
    await waitFor(() => expect(textarea).toHaveValue(""));
  });

  it("sends on Enter but inserts a newline on Shift+Enter", async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={onSend} />);

    const textarea = screen.getByLabelText("พิมพ์ข้อความ");
    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("line one"));
  });

  it("does not clear the input if onSend rejects", async () => {
    const onSend = jest.fn().mockRejectedValue(new Error("network error"));
    render(<MessageComposer onSend={onSend} />);

    const textarea = screen.getByLabelText("พิมพ์ข้อความ");
    fireEvent.change(textarea, { target: { value: "will fail" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));

    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(textarea).toHaveValue("will fail");
  });

  it("disables input and send button when disabled", () => {
    render(<MessageComposer onSend={jest.fn()} disabled />);
    expect(screen.getByLabelText("พิมพ์ข้อความ")).toBeDisabled();
    expect(screen.getByRole("button", { name: "ส่งข้อความ" })).toBeDisabled();
  });

  it("shows no paperclip at all when the caller doesn't support attachments", () => {
    render(<MessageComposer onSend={jest.fn()} />);
    expect(
      screen.queryByRole("button", { name: "แนบรูปภาพหรือไฟล์" }),
    ).not.toBeInTheDocument();
  });

  it("passes the picked file to onAttach", async () => {
    const onAttach = jest.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={jest.fn()} onAttach={onAttach} />);

    const file = new File(["bytes"], "item.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onAttach).toHaveBeenCalledWith(file, ""));
  });

  it("sends whatever is already typed along as the attachment's caption", async () => {
    const onAttach = jest.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={jest.fn()} onAttach={onAttach} />);

    const textarea = screen.getByLabelText("พิมพ์ข้อความ");
    fireEvent.change(textarea, { target: { value: "  ดูสภาพตามรูปนี้  " } });

    const file = new File(["bytes"], "cond.png", { type: "image/png" });
    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });

    // Typed text must not be silently thrown away just because the user
    // then picked a photo.
    await waitFor(() =>
      expect(onAttach).toHaveBeenCalledWith(file, "ดูสภาพตามรูปนี้"),
    );
    await waitFor(() => expect(textarea).toHaveValue(""));
  });

  it("keeps the typed caption if the upload fails", async () => {
    const onAttach = jest.fn().mockRejectedValue(new Error("too big"));
    render(<MessageComposer onSend={jest.fn()} onAttach={onAttach} />);

    const textarea = screen.getByLabelText("พิมพ์ข้อความ");
    fireEvent.change(textarea, { target: { value: "คำบรรยาย" } });
    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [new File(["b"], "x.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(onAttach).toHaveBeenCalled());
    expect(textarea).toHaveValue("คำบรรยาย");
  });

  it("ignores an empty file pick (user cancelled the dialog)", async () => {
    const onAttach = jest.fn();
    render(<MessageComposer onSend={jest.fn()} onAttach={onAttach} />);

    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [] },
    });

    expect(onAttach).not.toHaveBeenCalled();
  });

  describe("message length limit", () => {
    it("caps the textarea at the same limit the server enforces", () => {
      render(<MessageComposer onSend={jest.fn()} />);
      expect(screen.getByLabelText("พิมพ์ข้อความ")).toHaveAttribute(
        "maxLength",
        String(MAX_MESSAGE_LENGTH),
      );
    });

    it("truncates a paste that exceeds the limit instead of failing at send time", () => {
      // maxLength blocks typing past the cap but some browsers let a paste
      // through, so the change handler has to clamp it as well.
      render(<MessageComposer onSend={jest.fn()} />);
      const textarea = screen.getByLabelText("พิมพ์ข้อความ");

      fireEvent.change(textarea, {
        target: { value: "ก".repeat(MAX_MESSAGE_LENGTH + 500) },
      });

      expect(textarea.value).toHaveLength(MAX_MESSAGE_LENGTH);
    });

    it("hides the counter until the limit is actually in sight", () => {
      render(<MessageComposer onSend={jest.fn()} />);
      fireEvent.change(screen.getByLabelText("พิมพ์ข้อความ"), {
        target: { value: "สวัสดี" },
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("shows how much room is left as the limit approaches", () => {
      render(<MessageComposer onSend={jest.fn()} />);
      fireEvent.change(screen.getByLabelText("พิมพ์ข้อความ"), {
        target: { value: "ก".repeat(MAX_MESSAGE_LENGTH - 50) },
      });
      expect(screen.getByRole("status")).toHaveTextContent("เหลือ 50 ตัวอักษร");
    });

    it("still sends normally at exactly the limit", async () => {
      const onSend = jest.fn().mockResolvedValue(undefined);
      render(<MessageComposer onSend={onSend} />);
      fireEvent.change(screen.getByLabelText("พิมพ์ข้อความ"), {
        target: { value: "ก".repeat(MAX_MESSAGE_LENGTH) },
      });
      fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));

      await waitFor(() => expect(onSend).toHaveBeenCalled());
      expect(onSend.mock.calls[0][0]).toHaveLength(MAX_MESSAGE_LENGTH);
    });
  });
});
