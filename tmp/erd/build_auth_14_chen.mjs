import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Generate editable, uncompressed draw.io XML using the committed 14-table baseline.
// The working Prisma file may contain later, uncommitted tables; intentionally ignore it.
const source = execFileSync('git', ['show', 'HEAD:backend/services/auth-service/prisma/schema.prisma'], { encoding: 'utf8' });
const output = 'D:/ISE Project/Ise/output/erd/ER_auth_14.drawio';
const preview = 'D:/ISE Project/Ise/output/erd/ER_auth_14_chen_preview.svg';
const pageId = 'QHJz9qzJK7pLv-PV6rBe';
const pageWidth = 4900;
const pageHeight = 3800;
const red = '#A92932';
const xml = (s) => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const matches = [...source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
if (matches.length !== 14) throw new Error(`Expected 14 models, found ${matches.length}`);
const modelNames = new Set(matches.map((m) => m[1]));
const models = new Map(matches.map((m) => {
  const [, name, body] = m;
  const table = body.match(/@@map\("([^"]+)"\)/)?.[1] || name;
  const fkNames = new Set([...body.matchAll(/@relation\(fields:\s*\[(\w+)\]/g)].map((r) => r[1]));
  const fields = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
    const parsed = line.match(/^(\w+)\s+(\w+(?:\[\])?\??)\s*(.*)$/);
    if (!parsed) continue;
    const [, codeName, type, rest] = parsed;
    if (modelNames.has(type.replace(/[?\[\]]/g, ''))) continue;
    fields.push({
      name: rest.match(/@map\("([^"]+)"\)/)?.[1] || codeName,
      pk: rest.includes('@id'),
      fk: fkNames.has(codeName),
      uk: rest.includes('@unique'),
    });
  }
  return [name, { name, table, fields }];
}));

// Centers are spaced to leave each entity an attribute halo of ~1000 x 390 px.
const positions = new Map(Object.entries({
  User: [2400, 1730],
  ExecutiveAuditLog: [650, 430],
  ShopChangeRequest: [2400, 430],
  Report: [4150, 430],
  AdminAudit: [650, 1120],
  SellerProfile: [4150, 1120],
  BulkActionRun: [650, 1810],
  UserAddress: [4150, 1810],
  BuyerProfile: [650, 2500],
  UserRole: [4150, 2500],
  KycApplication: [600, 3400],
  BuyerActivityLog: [1800, 3400],
  RefreshToken: [3000, 3400],
  LoginLog: [4200, 3400],
}));
if ([...positions.keys()].some((name) => !models.has(name))) throw new Error('Layout references a missing model');

const relationships = [
  ['ExecutiveAuditLog', 'performs', 'N', false, false],
  ['ShopChangeRequest', 'requests', 'N', true, false],
  ['Report', 'reports', 'N', true, false],
  ['AdminAudit', 'performs', 'N', false, false],
  ['SellerProfile', 'has', '1', true, true],
  ['BulkActionRun', 'runs', 'N', false, false],
  ['UserAddress', 'has', 'N', true, false],
  ['BuyerProfile', 'has', '1', true, true],
  ['UserRole', 'holds', 'N', true, false],
  ['KycApplication', 'submits', 'N', true, false],
  ['BuyerActivityLog', 'records', 'N', true, false],
  ['RefreshToken', 'owns', 'N', true, false],
  ['LoginLog', 'logs in', 'N', true, false],
];

const edges = [];
const vertices = [];
const svgEdges = [];
const svgNodes = [];
function vertex(id, value, x, y, width, height, style, parent = '1') {
  vertices.push(`<mxCell id="${xml(id)}" value="${xml(value)}" style="${xml(style)}" vertex="1" parent="${xml(parent)}"><mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/></mxCell>`);
}
function edge(id, sourceId, targetId, style) {
  edges.push(`<mxCell id="${xml(id)}" value="" style="${xml(style)}" edge="1" parent="1" source="${xml(sourceId)}" target="${xml(targetId)}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
}
function svgLine(x1, y1, x2, y2, dashed = false, width = 2) {
  svgEdges.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${red}" stroke-width="${width}"${dashed ? ' stroke-dasharray="11 8"' : ''}/>`);
}
function svgText(value, x, y, size = 15, weight = 500, underline = false) {
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${red}"${underline ? ' text-decoration="underline"' : ''}>${xml(value)}</text>`;
}

const entityWidth = 198;
const entityHeight = 56;
const ovalWidth = 174;
const ovalHeight = 38;
const weak = new Set(['BuyerProfile', 'SellerProfile']);

vertex('diagram_title', 'AUTH SERVICE — CHEN ER DIAGRAM (14 TABLES)', 100, 55, 1640, 56,
  `text;html=1;strokeColor=none;fillColor=none;fontColor=${red};fontSize=31;fontStyle=1;fontFamily=Arial;align=left;verticalAlign=middle;`);
vertex('diagram_legend', 'Rectangle = entity   Ellipse = attribute   Diamond = relationship   Double border = weak / identifying   Dashed = logical ID reference, no DB foreign key', 102, 114, 3100, 35,
  `text;html=1;strokeColor=none;fillColor=none;fontColor=#74434A;fontSize=18;fontFamily=Arial;align=left;verticalAlign=middle;`);
svgNodes.push(svgText('AUTH SERVICE — CHEN ER DIAGRAM (14 TABLES)', 820, 83, 31, 700));
svgNodes.push(`<text x="102" y="146" font-family="Arial,sans-serif" font-size="18" fill="#74434A">Rectangle = entity　 Ellipse = attribute　 Diamond = relationship　 Double border = weak / identifying　 Dashed = logical ID reference, no DB foreign key</text>`);

function distributeAttributes(count) {
  const sideNames = ['top', 'bottom', 'left', 'right'];
  const counts = Object.fromEntries(sideNames.map((side) => [side, Math.floor(count / 4)]));
  for (let i = 0; i < count % 4; i++) counts[sideNames[i]]++;
  const slots = [];
  for (const side of sideNames) {
    const n = counts[side];
    for (let i = 0; i < n; i++) {
      const offset = (i - (n - 1) / 2);
      if (side === 'top') slots.push([offset * 190, -180]);
      if (side === 'bottom') slots.push([offset * 190, 180]);
      if (side === 'left') slots.push([-430, offset * 95]);
      if (side === 'right') slots.push([430, offset * 95]);
    }
  }
  return slots;
}

for (const [name, [cx, cy]] of positions) {
  const model = models.get(name);
  const isWeak = weak.has(name);
  const boxStyle = `shape=rectangle;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=${red};strokeWidth=2.2;fontColor=${red};fontSize=19;fontStyle=1;fontFamily=Arial;align=center;verticalAlign=middle;`;
  vertex(name, isWeak ? '' : model.table, cx - entityWidth / 2, cy - entityHeight / 2, entityWidth, entityHeight, boxStyle);
  svgNodes.push(`<rect x="${cx - entityWidth / 2}" y="${cy - entityHeight / 2}" width="${entityWidth}" height="${entityHeight}" fill="white" stroke="${red}" stroke-width="2.2"/>`);
  if (isWeak) {
    vertex(`${name}_inner`, model.table, 7, 7, entityWidth - 14, entityHeight - 14,
      `shape=rectangle;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=${red};strokeWidth=1.8;fontColor=${red};fontSize=18;fontStyle=1;fontFamily=Arial;align=center;verticalAlign=middle;`, name);
    svgNodes.push(`<rect x="${cx - entityWidth / 2 + 7}" y="${cy - entityHeight / 2 + 7}" width="${entityWidth - 14}" height="${entityHeight - 14}" fill="white" stroke="${red}" stroke-width="1.8"/>`);
  }
  svgNodes.push(svgText(model.table, cx, cy + 2, model.table.length > 19 ? 16 : 18, 700));
  const slots = distributeAttributes(model.fields.length);
  model.fields.forEach((field, i) => {
    const [dx, dy] = slots[i];
    const ax = cx + dx;
    const ay = cy + dy;
    const id = `${name}_attr_${field.name}`;
    const label = field.name + (field.uk ? ' [UK]' : '');
    const fontSize = label.length > 19 ? 12 : label.length > 15 ? 13 : 14;
    const fontStyle = field.pk ? '5' : '0';
    vertex(id, label, ax - ovalWidth / 2, ay - ovalHeight / 2, ovalWidth, ovalHeight,
      `ellipse;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=${red};strokeWidth=1.7;fontColor=${red};fontSize=${fontSize};fontStyle=${fontStyle};fontFamily=Arial;align=center;verticalAlign=middle;`);
    edge(`${name}_attr_edge_${field.name}`, name, id,
      `edgeStyle=none;rounded=0;html=1;strokeColor=${red};strokeWidth=1.5;startArrow=none;endArrow=none;`);
    svgLine(cx, cy, ax, ay, false, 1.5);
    svgNodes.push(`<ellipse cx="${ax}" cy="${ay}" rx="${ovalWidth / 2}" ry="${ovalHeight / 2}" fill="white" stroke="${red}" stroke-width="1.7"/>`);
    svgNodes.push(svgText(label, ax, ay + 1, fontSize, field.pk ? 700 : 500, field.pk));
  });
}

const [ux, uy] = positions.get('User');
for (const [name, verb, many, physical, identifying] of relationships) {
  const [tx, ty] = positions.get(name);
  const dx = tx - ux;
  const dy = ty - uy;
  const length = Math.hypot(dx, dy);
  const normalX = -dy / length;
  const normalY = dx / length;
  const diamondX = (ux + tx) / 2;
  const diamondY = (uy + ty) / 2;
  const diamondId = `rel_${name}`;
  const dWidth = 116;
  const dHeight = 82;
  const dStyle = `rhombus;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=${red};strokeWidth=2;fontColor=${red};fontSize=15;fontStyle=1;fontFamily=Arial;align=center;verticalAlign=middle;`;
  vertex(diamondId, identifying ? '' : verb, diamondX - dWidth / 2, diamondY - dHeight / 2, dWidth, dHeight, dStyle);
  if (identifying) vertex(`${diamondId}_inner`, verb, 8, 6, dWidth - 16, dHeight - 12,
    `rhombus;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=${red};strokeWidth=1.6;fontColor=${red};fontSize=15;fontStyle=1;fontFamily=Arial;align=center;verticalAlign=middle;`, diamondId);
  const dash = physical ? '' : 'dashed=1;dashPattern=10 7;';
  const linkStyle = `edgeStyle=none;rounded=0;html=1;strokeColor=${red};strokeWidth=2;startArrow=none;endArrow=none;${dash}`;
  edge(`rel_${name}_user`, 'User', diamondId, linkStyle);
  edge(`rel_${name}_entity`, diamondId, name, linkStyle);
  if (identifying) {
    // A red outer stroke and narrow white center render total participation
    // as two parallel-looking lines while keeping both paths attached to nodes.
    edge(`rel_${name}_entity_outer`, diamondId, name,
      `edgeStyle=none;rounded=0;html=1;strokeColor=${red};strokeWidth=5;startArrow=none;endArrow=none;`);
    edge(`rel_${name}_entity_inner`, diamondId, name,
      `edgeStyle=none;rounded=0;html=1;strokeColor=#FFFFFF;strokeWidth=1.5;startArrow=none;endArrow=none;`);
  }
  const label1X = ux + dx * 0.39 + normalX * 23;
  const label1Y = uy + dy * 0.39 + normalY * 23;
  const label2X = ux + dx * 0.61 + normalX * 23;
  const label2Y = uy + dy * 0.61 + normalY * 23;
  const labelStyle = `text;html=1;strokeColor=none;fillColor=#FFFFFF;fontColor=${red};fontSize=20;fontStyle=1;fontFamily=Arial;align=center;verticalAlign=middle;`;
  vertex(`card_${name}_user`, '1', label1X - 14, label1Y - 14, 28, 28, labelStyle);
  vertex(`card_${name}_entity`, many, label2X - 14, label2Y - 14, 28, 28, labelStyle);
  svgLine(ux, uy, diamondX, diamondY, !physical, 2);
  svgLine(diamondX, diamondY, tx, ty, !physical, identifying ? 4 : 2);
  svgNodes.push(`<polygon points="${diamondX},${diamondY - dHeight / 2} ${diamondX + dWidth / 2},${diamondY} ${diamondX},${diamondY + dHeight / 2} ${diamondX - dWidth / 2},${diamondY}" fill="white" stroke="${red}" stroke-width="2"/>`);
  if (identifying) svgNodes.push(`<polygon points="${diamondX},${diamondY - dHeight / 2 + 8} ${diamondX + dWidth / 2 - 10},${diamondY} ${diamondX},${diamondY + dHeight / 2 - 8} ${diamondX - dWidth / 2 + 10},${diamondY}" fill="white" stroke="${red}" stroke-width="1.6"/>`);
  svgNodes.push(svgText(verb, diamondX, diamondY + 1, 15, 700));
  svgNodes.push(svgText('1', label1X, label1Y, 20, 700));
  svgNodes.push(svgText(many, label2X, label2Y, 20, 700));
}

vertex('footer_note', 'PK attributes are underlined. [UK] marks single-column unique keys. Dashed actor_id links are conceptual only; the 14-table schema does not declare them as foreign keys.', 102, 3710, 3500, 40,
  'text;html=1;strokeColor=none;fillColor=none;fontColor=#74434A;fontSize=17;fontFamily=Arial;align=left;verticalAlign=middle;');
svgNodes.push(`<text x="102" y="3740" font-family="Arial,sans-serif" font-size="17" fill="#74434A">PK attributes are underlined. [UK] marks single-column unique keys. Dashed actor_id links are conceptual only; the schema does not declare them as foreign keys.</text>`);

const modelXml = `<mxGraphModel dx="1500" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${edges.join('')}${vertices.join('')}</root></mxGraphModel>`;
const drawio = `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="Codex" version="24.7.17"><diagram name="หน้า-1" id="${pageId}">${modelXml}</diagram></mxfile>\n`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}"><rect width="100%" height="100%" fill="#FFFFFF"/>${svgEdges.join('')}${svgNodes.join('')}</svg>`;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, drawio, 'utf8');
writeFileSync(preview, svg, 'utf8');
console.log(JSON.stringify({ output, preview, tables: models.size, relationships: relationships.length, attributes: [...models.values()].reduce((n, m) => n + m.fields.length, 0), bytes: Buffer.byteLength(drawio) }));
