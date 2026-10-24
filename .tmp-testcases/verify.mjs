import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile}from '@oai/artifact-tool';
const dir='C:/ise/Ise/.tmp-testcases';
const w=await SpreadsheetFile.importXlsx(await FileBlob.load(dir+'/readback.xlsx'));
for(const [i,range]of ['C7:G10','C18:G20','C32:G36'].entries()){
const b=await w.render({sheetName:'Test_Case_4',range,scale:1});
await fs.writeFile(dir+'/verified-'+i+'.png',new Uint8Array(await b.arrayBuffer()));
}
console.log('Rendered edited ranges from Drive readback.');
