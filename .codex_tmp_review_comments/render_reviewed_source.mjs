import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/sirad/Downloads/Test_Cases4_Final_reviewed.xlsx";
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

console.log((await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 7000,
  tableMaxRows: 10,
  tableMaxCols: 9,
  tableMaxCellChars: 100,
})).ndjson);

const preview = await workbook.render({
  sheetName: "Test Cases",
  range: "A1:I18",
  scale: 1,
  format: "png",
});
await fs.writeFile("reviewed_source_top.png", new Uint8Array(await preview.arrayBuffer()));
