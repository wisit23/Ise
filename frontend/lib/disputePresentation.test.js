import { caseStage, evidenceError } from "./disputePresentation";
test("case evidence deadlines are never invented from automatic case SLA", () => {
  expect(caseStage({ status: "OPEN", assignedTo: null }).step).toBe(0);
  expect(caseStage({ status: "OPEN", assignedTo: "cs" }).step).toBe(1);
  expect(caseStage({ status: "OPEN", assignedRole: "ADMIN" }).step).toBe(2);
  expect(caseStage({ status: "NEEDS_INFO" }).label).toBe("รอข้อมูลเพิ่มเติม");
  expect(caseStage({ status: "DECIDED" }).step).toBe(3);
});
test("evidence validation shares server count, MIME and exact size boundaries", () => {
  const valid = {
    name: "photo.png",
    type: "image/png",
    size: 20 * 1024 * 1024,
  };
  expect(evidenceError([valid])).toBe("");
  expect(evidenceError([{ ...valid, size: valid.size + 1 }])).toContain(
    "20 MB",
  );
  expect(evidenceError(Array(6).fill(valid))).toContain("5 ไฟล์");
  expect(evidenceError([{ ...valid, type: "application/pdf" }])).toContain(
    "รองรับรูป",
  );
});
