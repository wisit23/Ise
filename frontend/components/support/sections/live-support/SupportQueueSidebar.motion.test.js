import { render, screen } from "@testing-library/react";
import SupportQueueSidebar from "./SupportQueueSidebar";

test("queue stays mounted without sliding or fading across scope and loading changes", () => {
  const props = { tickets: [], search: "", onRefresh: jest.fn(), onScopeChange: jest.fn(), onSearchChange: jest.fn() };
  const { rerender } = render(<SupportQueueSidebar {...props} scope="all" />);
  const list = screen.getByLabelText("รายการ Ticket");
  rerender(<SupportQueueSidebar {...props} scope="unassigned" loading />);
  expect(screen.getByLabelText("รายการ Ticket")).toBe(list);
  expect(list.style.getPropertyValue("--queue-from")).toBe("");
  expect(list.className).not.toMatch(/animate|list/);
  expect(list.querySelector(".animate-pulse")).toBeNull();
  rerender(<SupportQueueSidebar {...props} scope="unassigned" loading={false} />);
  expect(screen.getByLabelText("รายการ Ticket")).toBe(list);
  rerender(<SupportQueueSidebar {...props} scope="all" />);
  expect(screen.getByLabelText("รายการ Ticket")).toBe(list);
});
