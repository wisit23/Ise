import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { apiFetch } from "../../../lib/api";
import BulkActionsSection from "./BulkActionsSection";

jest.mock("../../../lib/api", () => ({ apiFetch: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

function fillForm(ids = "user-1\nmissing-user") {
  fireEvent.change(screen.getByLabelText("Account IDs"), {
    target: { value: ids },
  });
  fireEvent.change(screen.getByLabelText("เหตุผล Bulk"), {
    target: { value: "confirmed moderation case" },
  });
}

it("requires a dry-run, shows partial outcomes and retries only failed accounts", async () => {
  apiFetch
    .mockResolvedValueOnce({
      action: "WARN_USER",
      dryRun: true,
      total: 2,
      succeeded: 1,
      failed: 1,
      results: [
        { id: "user-1", ok: true },
        { id: "missing-user", ok: false, reason: "user not found" },
      ],
    })
    .mockResolvedValueOnce({
      action: "WARN_USER",
      dryRun: false,
      total: 2,
      succeeded: 1,
      failed: 1,
      results: [
        { id: "user-1", ok: true },
        { id: "missing-user", ok: false, reason: "user not found" },
      ],
    })
    .mockResolvedValueOnce({
      action: "WARN_USER",
      dryRun: false,
      total: 1,
      succeeded: 0,
      failed: 1,
      results: [
        { id: "missing-user", ok: false, reason: "user not found" },
      ],
    });

  render(<BulkActionsSection token="safety-token" />);
  fillForm();

  const confirm = screen.getByRole("button", { name: "ยืนยันการตักเตือน" });
  expect(confirm).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Preview / Dry-run" }));

  expect(await screen.findByText("ผล Preview — ยังไม่มีการเขียนข้อมูล")).toBeInTheDocument();
  expect(apiFetch.mock.calls[0][1].body).toEqual({
    action: "WARN_USER",
    ids: ["user-1", "missing-user"],
    reason: "confirmed moderation case",
    dryRun: true,
  });
  expect(confirm).toBeEnabled();

  fireEvent.click(confirm);
  expect(await screen.findByText("ผลการดำเนินการจริง")).toBeInTheDocument();
  const originalKey = apiFetch.mock.calls[1][1].body.idempotencyKey;
  expect(originalKey).toMatch(/^bulk:/);

  fireEvent.click(
    screen.getByRole("button", { name: "Retry เฉพาะ 1 รายการที่ล้มเหลว" }),
  );
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
  const retryBody = apiFetch.mock.calls[2][1].body;
  expect(retryBody.ids).toEqual(["missing-user"]);
  expect(retryBody.idempotencyKey.startsWith(`${originalKey}:retry:`)).toBe(
    true,
  );
});

it("replays an ambiguous request with the exact same operation id and payload", async () => {
  apiFetch
    .mockResolvedValueOnce({
      action: "WARN_USER",
      dryRun: true,
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [{ id: "user-1", ok: true }],
    })
    .mockRejectedValueOnce(new Error("network timeout"))
    .mockResolvedValueOnce({
      action: "WARN_USER",
      dryRun: false,
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [{ id: "user-1", ok: true }],
    });

  render(<BulkActionsSection token="safety-token" />);
  fillForm("user-1");
  fireEvent.click(screen.getByRole("button", { name: "Preview / Dry-run" }));
  await screen.findByText("ผล Preview — ยังไม่มีการเขียนข้อมูล");
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันการตักเตือน" }));

  expect(await screen.findByText(/network timeout/)).toBeInTheDocument();
  const originalBody = apiFetch.mock.calls[1][1].body;
  fireEvent.click(
    screen.getByRole("button", { name: "ตรวจซ้ำด้วย Operation ID เดิม" }),
  );
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
  expect(apiFetch.mock.calls[2][1].body).toEqual(originalBody);
});

it("blocks a batch over 100 accounts before calling the API", () => {
  render(<BulkActionsSection token="safety-token" />);
  fillForm(Array.from({ length: 101 }, (_, index) => `user-${index}`).join("\n"));

  fireEvent.click(screen.getByRole("button", { name: "Preview / Dry-run" }));
  expect(screen.getByText("เลือกได้สูงสุด 100 บัญชีต่อครั้ง")).toBeInTheDocument();
  expect(apiFetch).not.toHaveBeenCalled();
});
