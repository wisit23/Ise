import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const path = "D:/ISE Project/Ise/outputs/test-cases4-corrected-20260915/Test_Cases4_Final_corrected.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
const sheet = workbook.worksheets.getItem("Test Cases");
const values = sheet.getRange("A8:I55").values;

const ids = values.map((r) => r[0]);
const issues = [];
if (values.length !== 48) issues.push(`row count ${values.length}`);
values.forEach((r, i) => {
  const expected = `TC${String(i + 1).padStart(2, "0")}`;
  if (r[0] !== expected) issues.push(`ID ${r[0]} != ${expected}`);
  if (/\((Negative|Boundary|Security)\)/i.test(String(r[2] || ""))) issues.push(`label in ${r[0]}`);
  if ((r[7] ?? "") !== "" || (r[8] ?? "") !== "") issues.push(`result columns not blank in ${r[0]}`);
  for (let c = 1; c <= 6; c += 1) {
    if (r[c] === null || r[c] === undefined || String(r[c]).trim() === "") issues.push(`blank required cell ${r[0]} col ${c + 1}`);
  }
});

const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "post-export error scan",
});

const preview = await workbook.render({
  sheetName: "Test Cases",
  range: "A48:I55",
  scale: 1,
  format: "png",
});
await fs.writeFile("corrected_post_export.png", new Uint8Array(await preview.arrayBuffer()));

console.log(JSON.stringify({
  sheetCount: workbook.worksheets.items.length,
  rowCount: values.length,
  firstId: ids[0],
  lastId: ids.at(-1),
  issues,
  errorScan: errorScan.ndjson,
}));
