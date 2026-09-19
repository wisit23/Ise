import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/sirad/Downloads/Test_Cases4_Final_reviewed.xlsx";
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 4000,
});

const threads = await workbook.inspect({
  kind: "thread",
  maxChars: 20000,
  options: { maxResults: 200 },
});

console.log("SHEETS");
console.log(sheets.ndjson);
console.log("THREADS");
console.log(threads.ndjson);
