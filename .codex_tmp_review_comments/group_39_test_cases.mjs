import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/Users/sirad/Downloads/Test_Cases4_Final_corrected.xlsx";
const outputDir = "D:/ISE Project/Ise/outputs/test-cases4-grouped-20261005";
const outputPath = `${outputDir}/Test_Cases4_Grouped_39.xlsx`;
const previewTopPath = "D:/ISE Project/Ise/.codex_tmp_review_comments/grouped_top.png";
const previewBottomPath = "D:/ISE Project/Ise/.codex_tmp_review_comments/grouped_bottom.png";

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const sheet = workbook.worksheets.getItem("Test Cases");
const sourceRows = sheet.getRange("A8:I55").values;

const oldIds = [
  "TC01", "TC02", "TC03", "TC04", "TC05", "TC06", "TC07", "TC08", "TC09",
  "TC10", "TC11", "TC12", "TC13", "TC14", "TC15", "TC16", "TC17", "TC19",
  "TC20", "TC25", "TC26", "TC27", "TC28", "TC29", "TC30", "TC31", "TC32",
  "TC33", "TC34", "TC35", "TC36", "TC37", "TC38", "TC39", "TC40", "TC45",
  "TC46", "TC47", "TC48",
];

const byId = new Map(sourceRows.map((row) => [String(row[0] ?? "").trim(), row]));
const selectedRows = oldIds.map((oldId, index) => {
  const source = byId.get(oldId);
  if (!source) throw new Error(`Missing source row ${oldId}`);
  const next = [...source];
  next[0] = `TC${String(index + 1).padStart(2, "0")}`;
  next[1] = null;
  next[7] = null;
  next[8] = null;
  return next;
});

sheet.getRange("A8:I55").clear({ applyTo: "contents" });
sheet.getRange("A8:I46").values = selectedRows;
sheet.getRange("H8:I46").clear({ applyTo: "contents" });

const groups = [
  { range: "B8:B11", label: "FR-15 / UC-12\nสรุปยอดขายรายเดือน" },
  { range: "B12:B16", label: "FR-16 / UC-12\nAudit Log การยกเลิก" },
  { range: "B17:B20", label: "FR-17 / UC-12\nอัตราการยกเลิกผิดปกติ" },
  { range: "B21:B23", label: "FR-18 / UC-12\nExport รายงานบัญชี" },
  { range: "B24:B25", label: "FR-19 / UC-12\nDashboard การเงินรายวัน" },
  { range: "B26", label: "UC-12 Extension 2a\nสิทธิ์เข้าถึงรายงาน" },
  { range: "B27:B29", label: "FR-26\nข้อมูลร้านและการขาย" },
  { range: "B30:B32", label: "FR-27 / UC-12\nDashboard ธุรกรรม" },
  { range: "B33:B39", label: "FR-28 / UC-13\nจัดการสิทธิ์ร้าน" },
  { range: "B40:B42", label: "FR-29 / UC-13\nเปิด-ปิดโรงอาหาร" },
  { range: "B43:B46", label: "FR-32\nจัดการผู้ใช้งาน" },
];

for (const group of groups) {
  const range = sheet.getRange(group.range);
  if (group.range.includes(":")) range.merge();
  range.values = [[group.label]];
  range.format.fill = "#E8EEF8";
  range.format.font = { name: "Arial", size: 10, bold: true, color: "#2F477A" };
  range.format.horizontalAlignment = "center";
  range.format.verticalAlignment = "center";
  range.format.wrapText = true;
  range.format.borders = { preset: "all", style: "thin", color: "#B8C2D6" };
}

sheet.freezePanes.unfreeze();

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const topPreview = await workbook.render({
  sheetName: "Test Cases",
  range: "A1:I27",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewTopPath, new Uint8Array(await topPreview.arrayBuffer()));

const bottomPreview = await workbook.render({
  sheetName: "Test Cases",
  range: "A27:I46",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewBottomPath, new Uint8Array(await bottomPreview.arrayBuffer()));

const check = await workbook.inspect({
  kind: "table",
  range: "Test Cases!A7:I46",
  include: "values,formulas",
  tableMaxRows: 45,
  tableMaxCols: 9,
  maxChars: 18000,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);
console.log(JSON.stringify({ outputPath, previewTopPath, previewBottomPath, caseCount: selectedRows.length }));
