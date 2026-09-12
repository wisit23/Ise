import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import MessageAttachment from "./MessageAttachment";
import { fetchAuthedBlobUrl } from "../../lib/api";

jest.mock("../../lib/api", () => ({ fetchAuthedBlobUrl: jest.fn() }));

const IMAGE_MESSAGE = {
  id: "msg-img",
  conversationId: "conv-1",
  type: "IMAGE",
  payload: { filename: "item.png", mimeType: "image/png", size: 2048 },
};

const FILE_MESSAGE = {
  id: "msg-file",
  conversationId: "conv-1",
  type: "FILE",
  payload: {
    filename: "receipt.pdf",
    mimeType: "application/pdf",
    size: 3 * 1024 * 1024,
  },
};

describe("MessageAttachment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.URL.createObjectURL = jest.fn(() => "blob:fake");
    global.URL.revokeObjectURL = jest.fn();
  });

  it("fetches an image WITH auth rather than using a bare src, and renders it", async () => {
    fetchAuthedBlobUrl.mockResolvedValue("blob:image-bytes");

    render(<MessageAttachment message={IMAGE_MESSAGE} own={false} />);

    // A private attachment must never be a plain <img src="/api/...">: a
    // bare navigation carries no bearer token and would 401.
    await waitFor(() =>
      expect(fetchAuthedBlobUrl).toHaveBeenCalledWith(
        "/api/chat/conversations/conv-1/attachments/msg-img",
      ),
    );
    const img = await screen.findByAltText("item.png");
    expect(img).toHaveAttribute("src", "blob:image-bytes");
  });

  it("shows a loading placeholder before the bytes arrive, never an empty img", async () => {
    let resolveFetch;
    fetchAuthedBlobUrl.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<MessageAttachment message={IMAGE_MESSAGE} own={false} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    resolveFetch("blob:late");
    expect(await screen.findByAltText("item.png")).toBeInTheDocument();
  });

  it("surfaces a failed image load instead of a broken image box", async () => {
    fetchAuthedBlobUrl.mockRejectedValue(new Error("403"));

    render(<MessageAttachment message={IMAGE_MESSAGE} own={false} />);

    expect(await screen.findByText("โหลดรูปภาพไม่สำเร็จ")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("does NOT eagerly download a non-image, showing name and size instead", async () => {
    render(<MessageAttachment message={FILE_MESSAGE} own={false} />);

    expect(screen.getByText("receipt.pdf")).toBeInTheDocument();
    expect(screen.getByText("3.0 MB")).toBeInTheDocument();
    // Pulling every pdf/video into memory just to render a row would waste
    // bandwidth on files the user may never open.
    expect(fetchAuthedBlobUrl).not.toHaveBeenCalled();
  });

  it("fetches a file only when the user actually clicks it", async () => {
    fetchAuthedBlobUrl.mockResolvedValue("blob:pdf-bytes");

    render(<MessageAttachment message={FILE_MESSAGE} own={false} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(fetchAuthedBlobUrl).toHaveBeenCalledWith(
        "/api/chat/conversations/conv-1/attachments/msg-file",
      ),
    );
  });

  it("revokes the object URL on unmount so the blob isn't leaked", async () => {
    fetchAuthedBlobUrl.mockResolvedValue("blob:image-bytes");

    const { unmount } = render(
      <MessageAttachment message={IMAGE_MESSAGE} own={false} />,
    );
    await screen.findByAltText("item.png");

    unmount();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:image-bytes");
  });
});
