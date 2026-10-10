import { fireEvent, render, screen } from "@testing-library/react";
import DisputeChatPanel from "./DisputeChatPanel";

jest.mock("../../EmbeddedChat", () => ({ conversationId, readOnly }) => <div data-testid="single-chat">{conversationId}:{String(readOnly)}</div>);

const dispute = { order: { buyerId: "buyer-1", sellerId: "seller-1" } };

it("shows one chat and clearly switches the intended recipient", () => {
  const onSideChange = jest.fn();
  const { rerender } = render(<DisputeChatPanel dispute={dispute} conversationId="buyer-room" side="buyer" onSideChange={onSideChange} onClose={() => {}} />);
  expect(screen.getAllByTestId("single-chat")).toHaveLength(1);
  expect(screen.getByTestId("single-chat")).toHaveTextContent("buyer-room:false");
  expect(screen.getByRole("status")).toHaveTextContent("ผู้ซื้อเท่านั้น");
  fireEvent.click(screen.getByRole("tab", { name: /ผู้ขาย/ }));
  expect(onSideChange).toHaveBeenCalledWith("seller");

  rerender(<DisputeChatPanel dispute={dispute} conversationId="seller-room" side="seller" onSideChange={onSideChange} onClose={() => {}} />);
  expect(screen.getAllByTestId("single-chat")).toHaveLength(1);
  expect(screen.getByTestId("single-chat")).toHaveTextContent("seller-room:false");
  expect(screen.getByRole("status")).toHaveTextContent("ผู้ขายเท่านั้น");
});
