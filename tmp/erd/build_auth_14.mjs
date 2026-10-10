import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const source = execFileSync('git', ['show', 'HEAD:backend/services/auth-service/prisma/schema.prisma'], { encoding: 'utf8' });
const output = 'D:/ISE Project/Ise/output/erd/ER_auth_14.drawio';
const pageId = 'QHJz9qzJK7pLv-PV6rBe';
const cardWidth = 365;
const rowHeight = 20;
const headerHeight = 34;

const escapeXml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const modelMatches = [...source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
if (modelMatches.length !== 14) throw new Error(`Expected baseline 14 models; found ${modelMatches.length}`);
const modelNames = new Set(modelMatches.map((match) => match[1]));

const models = new Map(modelMatches.map((match) => {
  const [, name, body] = match;
  const table = body.match(/@@map\("([^"]+)"\)/)?.[1] || name;
  const relations = [...body.matchAll(/\b(\w+)\s+\w+\s+@relation\(fields:\s*\[(\w+)\],\s*references:\s*\[(\w+)\]/g)];
  const fkFields = new Set(relations.map((relation) => relation[2]));
  const fields = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
    const matchField = line.match(/^(\w+)\s+(\w+(?:\[\])?\??)\s*(.*)$/);
    if (!matchField) continue;
    const [, codeName, type, rest] = matchField;
    if (modelNames.has(type.replace(/[?\[\]]/g, ''))) continue;
    const dbName = rest.match(/@map\("([^"]+)"\)/)?.[1] || codeName;
    const flags = [rest.includes('@id') ? 'PK' : '', fkFields.has(codeName) ? 'FK' : '', rest.includes('@unique') ? 'UK' : ''].filter(Boolean);
    fields.push({ name: dbName, type, flags });
  }
  return [name, { name, table, fields }];
}));

const childNames = [
  'BuyerProfile', 'SellerProfile', 'UserAddress', 'UserRole', 'LoginLog',
  'RefreshToken', 'BuyerActivityLog', 'KycApplication', 'Report', 'ShopChangeRequest',
];
const standaloneNames = ['AdminAudit', 'BulkActionRun', 'ExecutiveAuditLog'];
const optionalOne = new Set(['BuyerProfile', 'SellerProfile']);

const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
function vertex(id, value, x, y, width, height, style, parent = '1') {
  cells.push(`<mxCell id="${escapeXml(id)}" value="${escapeXml(value)}" style="${escapeXml(style)}" vertex="1" parent="${escapeXml(parent)}"><mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/></mxCell>`);
}
function addTable(model, x, y, theme = 'normal') {
  const { name, table, fields } = model;
  const height = headerHeight + fields.length * rowHeight;
  const dark = theme === 'root' ? '#123B58' : theme === 'standalone' ? '#4C5674' : '#087E8B';
  const style = `swimlane;html=1;startSize=${headerHeight};horizontal=1;rounded=1;arcSize=7;fillColor=${dark};swimlaneFillColor=#FFFFFF;strokeColor=#BCD0DD;strokeWidth=1.5;fontColor=#FFFFFF;fontSize=16;fontStyle=1;fontFamily=Arial;align=left;spacingLeft=12;container=1;collapsible=0;`;
  vertex(name, table, x, y, cardWidth, height, style);
  fields.forEach((field, index) => {
    const role = field.flags.join(',');
    const value = `${role ? role.padEnd(5, ' ') + '  ' : '       '}${field.name} : ${field.type}`;
    const fill = index % 2 === 0 ? '#FFFFFF' : '#F4F8FA';
    const rowStyle = `rounded=0;html=1;whiteSpace=wrap;overflow=hidden;fillColor=${fill};strokeColor=none;fontColor=#21364B;fontSize=12;fontFamily=Arial;align=left;verticalAlign=middle;spacingLeft=9;`;
    vertex(`${name}_${field.name}`, value, 0, headerHeight + index * rowHeight, cardWidth, rowHeight, rowStyle, name);
  });
  return height;
}

vertex('title', 'AUTH SERVICE — ER DIAGRAM (14 TABLES)', 65, 25, 1110, 42,
  'text;html=1;strokeColor=none;fillColor=none;fontColor=#123B58;fontSize=27;fontStyle=1;fontFamily=Arial;align=left;verticalAlign=middle;');
vertex('subtitle', 'Physical relationships from the 14-table Prisma baseline · PK / FK / UK shown per attribute', 66, 69, 1120, 25,
  'text;html=1;strokeColor=none;fillColor=none;fontColor=#53687C;fontSize=13;fontFamily=Arial;align=left;verticalAlign=middle;');
vertex('legend', 'PK = Primary Key     FK = Foreign Key     UK = Unique Key     ? = nullable     [] = array', 66, 107, 1010, 28,
  'rounded=1;arcSize=8;html=1;fillColor=#EDF6F6;strokeColor=#CDE5E5;fontColor=#176772;fontSize=12;fontFamily=Arial;align=left;spacingLeft=12;verticalAlign=middle;');

const user = models.get('User');
addTable(user, 65, 1080, 'root');
vertex('usersNote', 'Identity root · all solid lines are actual database FKs to users.id', 65, 1023, cardWidth, 43,
  'rounded=1;arcSize=8;html=1;fillColor=#EAF3F9;strokeColor=#C4D8E8;fontColor=#255273;fontSize=12;fontFamily=Arial;align=center;verticalAlign=middle;whiteSpace=wrap;');

let childY = 155;
const positions = new Map();
for (const name of childNames) {
  const model = models.get(name);
  positions.set(name, childY);
  childY += addTable(model, 580, childY) + 45;
}

vertex('softNote', 'SOFT REFERENCES / NO FK', 1050, 152, cardWidth, 34,
  'rounded=1;arcSize=8;html=1;fillColor=#F1F2F8;strokeColor=#D7DBEA;fontColor=#4C5674;fontSize=14;fontStyle=1;fontFamily=Arial;align=center;verticalAlign=middle;');
let standaloneY = 205;
for (const name of standaloneNames) {
  standaloneY += addTable(models.get(name), 1050, standaloneY, 'standalone') + 55;
}
vertex('softDetail', 'actor_id, target_id, reviewed_by, decided_by and product_id are stored as IDs where shown, but are not database FKs unless marked FK on the row.', 1050, standaloneY + 5, cardWidth, 86,
  'rounded=1;arcSize=8;html=1;whiteSpace=wrap;fillColor=#F7F8FC;strokeColor=#D7DBEA;fontColor=#4C5674;fontSize=12;fontFamily=Arial;align=left;verticalAlign=middle;spacing=12;');

childNames.forEach((name, index) => {
  const laneX = 455 + index * 10;
  const userAnchorY = 1080 + 47 + index * 15;
  const targetY = positions.get(name) + 25;
  const edgeStyle = 'edgeStyle=segmentEdgeStyle;rounded=0;html=1;strokeColor=#8AA6B4;strokeWidth=1.6;startArrow=ERone;startFill=0;endArrow=' + (optionalOne.has(name) ? 'ERzeroToOne' : 'ERzeroToMany') + ';endFill=0;exitX=1;exitY=' + ((userAnchorY - 1080) / (headerHeight + user.fields.length * rowHeight)).toFixed(3) + ';exitDx=0;exitDy=0;entryX=0;entryY=0.12;entryDx=0;entryDy=0;';
  cells.push(`<mxCell id="edge_${name}" value="" style="${escapeXml(edgeStyle)}" edge="1" parent="1" source="User" target="${name}"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="${laneX}" y="${userAnchorY}"/><mxPoint x="${laneX}" y="${targetY}"/></Array></mxGeometry></mxCell>`);
});

const pageHeight = Math.max(childY + 30, standaloneY + 165, 1600);
const modelXml = `<mxGraphModel dx="1510" dy="880" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1480" pageHeight="${pageHeight}" math="0" shadow="0"><root>${cells.join('')}</root></mxGraphModel>`;
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="Codex" version="24.7.17"><diagram name="หน้า-1" id="${pageId}">${modelXml}</diagram></mxfile>\n`;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, xml, 'utf8');
console.log(JSON.stringify({ output, tables: modelMatches.length, trueFkEdges: childNames.length, pageWidth: 1480, pageHeight, bytes: Buffer.byteLength(xml) }));
