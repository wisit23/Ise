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
    await waitFor(() => expect(textarea).toHaveValue("will fail"));
  });

  it("keeps focus and a new draft while the previous message is sending", async () => {
    let finishSend;
    const onSend = jest.fn(() => new Promise((resolve) => { finishSend = resolve; }));
    render(<MessageComposer onSend={onSend} />);

    const textarea = screen.getByLabelText("พิมพ์ข้อความ");
    fireEvent.change(textarea, { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
    expect(textarea).toHaveFocus();
    expect(textarea).not.toBeDisabled();
    fireEvent.change(textarea, { target: { value: "second" } });
    await waitFor(() => expect(textarea).toHaveValue("second"));

    finishSend();
    await waitFor(() => expect(screen.getByRole("button", { name: "ส่งข้อความ" })).toBeEnabled());
    expect(textarea).toHaveFocus();
    expect(textarea).toHaveValue("second");
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

  it("shows thumbnail preview when file is picked and passes file to onAttach on send", async () => {
    const onAttach = jest.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={jest.fn()} onAttach={onAttach} />);

    const file = new File(["bytes"], "item.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });

    // Expect preview card with file name
    expect(screen.getByText("item.png")).toBeInTheDocument();

    // Clicking send submits the attachment
    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
    await waitFor(() => expect(onAttach).toHaveBeenCalledWith(file, ""));
  });

  it("allows removing the pending attachment before sending", () => {
    render(<MessageComposer onSend={jest.fn()} onAttach={jest.fn()} />);

    const file = new File(["bytes"], "remove-me.png", { type: "image/png" });
    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });

    expect(screen.getByText("remove-me.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ลบไฟล์ที่แนบ" }));

    expect(screen.queryByText("remove-me.png")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));

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

    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
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

  describe("pasting an image", () => {
    function pasteFiles(target, files) {
      fireEvent.paste(target, {
        clipboardData: {
          items: files.map((file) => ({
            kind: "file",
            type: file.type,
            getAsFile: () => file,
          })),
        },
      });
    }

    it("attaches a pasted screenshot and sends it with the typed caption", async () => {
      const onAttach = jest.fn().mockResolvedValue(undefined);
      render(<MessageComposer onSend={jest.fn()} onAttach={onAttach} />);
      const textarea = screen.getByLabelText("พิมพ์ข้อความ");
      fireEvent.change(textarea, { target: { value: "รอยตรงนี้" } });

      const file = new File(["bytes"], "image.png", { type: "image/png" });
      pasteFiles(textarea, [file]);

      expect(screen.getByText("image.png")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
      await waitFor(() =>
        expect(onAttach).toHaveBeenCalledWith(file, "รอยตรงนี้"),
      );
    });

    it("ignores pasted images when the caller doesn't support attachments", () => {
      render(<MessageComposer onSend={jest.fn()} />);
      const textarea = screen.getByLabelText("พิมพ์ข้อความ");

      pasteFiles(textarea, [
        new File(["bytes"], "image.png", { type: "image/png" }),
      ]);

      expect(screen.queryByText("image.png")).not.toBeInTheDocument();
    });

    it("rejects a pasted image that is too large", () => {
      const onAttach = jest.fn();
      render(<MessageComposer onSend={jest.fn()} onAttach={onAttach} />);
      const file = new File(["bytes"], "huge.png", { type: "image/png" });
      Object.defineProperty(file, "size", { value: 1024 * 1024 * 1024 });

      pasteFiles(screen.getByLabelText("พิมพ์ข้อความ"), [file]);

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.queryByText("huge.png")).not.toBeInTheDocument();
    });
  });

  describe("dragging a file onto the composer", () => {
    function dataTransfer(files) {
      return {
        types: ["Files"],
        items: files.map((f) => ({ kind: "file", type: f.type })),
        files,
        dropEffect: "none",
      };
    }
    const composerRoot = () =>
      screen.getByLabelText("พิมพ์ข้อความ").closest("div.relative.bg-white\\/95");

    it("shows the drop panel and attaches the dropped image", async () => {
      const onAttach = jest.fn().mockResolvedValue(undefined);
      render(<MessageComposer onSend={jest.fn()} onAttach={onAttach} />);
      const file = new File(["bytes"], "dropped.png", { type: "image/png" });
      const root = composerRoot();

      fireEvent.dragEnter(root, { dataTransfer: dataTransfer([file]) });
      expect(screen.getByRole("status")).toHaveTextContent("วางไฟล์เพื่อแนบ");

      fireEvent.drop(root, { dataTransfer: dataTransfer([file]) });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByText("dropped.png")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
      await waitFor(() => expect(onAttach).toHaveBeenCalledWith(file, ""));
    });

    it("hides the panel only once the drag has left the whole composer", () => {
      render(<MessageComposer onSend={jest.fn()} onAttach={jest.fn()} />);
      const file = new File(["bytes"], "x.png", { type: "image/png" });
      const root = composerRoot();
      const textarea = screen.getByLabelText("พิมพ์ข้อความ");

      fireEvent.dragEnter(root, { dataTransfer: dataTransfer([file]) });
      fireEvent.dragEnter(textarea, { dataTransfer: dataTransfer([file]) });
      fireEvent.dragLeave(textarea, { dataTransfer: dataTransfer([file]) });
      expect(screen.getByRole("status")).toBeInTheDocument();

      fireEvent.dragLeave(root, { dataTransfer: dataTransfer([file]) });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("warns while an unsupported file is dragged over", () => {
      render(<MessageComposer onSend={jest.fn()} onAttach={jest.fn()} />);
      const file = new File(["bytes"], "app.exe", {
        type: "application/x-msdownload",
      });

      fireEvent.dragEnter(composerRoot(), { dataTransfer: dataTransfer([file]) });

      expect(screen.getByRole("status")).toHaveTextContent("ไฟล์ชนิดนี้แนบไม่ได้");
    });

    describe("inside a chat panel with a message list", () => {
      function renderPanel(onAttach) {
        render(
          <div>
            <div data-testid="outside" />
            <div data-testid="panel">
              <ul data-chat-messages>
                <li data-testid="bubble">สวัสดี</li>
              </ul>
              <MessageComposer onSend={jest.fn()} onAttach={onAttach} />
            </div>
          </div>,
        );
      }

      it("accepts a file dropped on the message list, not just the composer", async () => {
        const onAttach = jest.fn().mockResolvedValue(undefined);
        renderPanel(onAttach);
        const file = new File(["bytes"], "panel.png", { type: "image/png" });
        const bubble = screen.getByTestId("bubble");

        fireEvent.dragEnter(bubble, { dataTransfer: dataTransfer([file]) });
        expect(screen.getByRole("status")).toHaveTextContent("วางไฟล์เพื่อแนบ");

        fireEvent.drop(bubble, { dataTransfer: dataTransfer([file]) });
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
        await waitFor(() => expect(onAttach).toHaveBeenCalledWith(file, ""));
      });

      it("ignores a photo dragged from inside the page, e.g. a chat image", () => {
        const onAttach = jest.fn();
        renderPanel(onAttach);
        const file = new File(["bytes"], "chat-photo.png", { type: "image/png" });
        const bubble = screen.getByTestId("bubble");

        fireEvent.dragStart(bubble);
        fireEvent.dragEnter(bubble, { dataTransfer: dataTransfer([file]) });
        fireEvent.drop(bubble, { dataTransfer: dataTransfer([file]) });
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.queryByText("chat-photo.png")).not.toBeInTheDocument();

        // Once that drag ends, files from the desktop work again.
        fireEvent.dragEnd(bubble);
        fireEvent.dragEnter(bubble, { dataTransfer: dataTransfer([file]) });
        expect(screen.getByRole("status")).toBeInTheDocument();
      });

      it("leaves drags outside the chat panel alone", () => {
        renderPanel(jest.fn());
        const file = new File(["bytes"], "x.png", { type: "image/png" });

        fireEvent.dragEnter(screen.getByTestId("outside"), {
          dataTransfer: dataTransfer([file]),
        });

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      });

      it("hides the overlay once the drag leaves the panel", () => {
        renderPanel(jest.fn());
        const file = new File(["bytes"], "x.png", { type: "image/png" });
        const panel = screen.getByTestId("panel");
        const bubble = screen.getByTestId("bubble");

        fireEvent.dragEnter(panel, { dataTransfer: dataTransfer([file]) });
        fireEvent.dragEnter(bubble, { dataTransfer: dataTransfer([file]) });
        fireEvent.dragLeave(panel, { dataTransfer: dataTransfer([file]) });
        expect(screen.getByRole("status")).toBeInTheDocument();

        fireEvent.dragLeave(bubble, { dataTransfer: dataTransfer([file]) });
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      });
    });

    it("ignores drags when the caller doesn't support attachments", () => {
      render(<MessageComposer onSend={jest.fn()} />);
      const file = new File(["bytes"], "x.png", { type: "image/png" });

      fireEvent.dragEnter(composerRoot(), { dataTransfer: dataTransfer([file]) });

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
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
