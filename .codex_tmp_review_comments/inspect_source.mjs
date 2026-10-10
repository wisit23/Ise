import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/Users/sirad/Downloads/Test_Cases4_Final_corrected.xlsx";
const previewPath = "D:/ISE Project/Ise/.codex_tmp_review_comments/source_preview.png";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 60,
  tableMaxCols: 9,
  tableMaxCellChars: 180,
});
console.log(summary.ndjson);

const preview = await workbook.render({
  sheetName: "Test Cases",
  range: "A1:I20",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
console.log(JSON.stringify({ previewPath }));
