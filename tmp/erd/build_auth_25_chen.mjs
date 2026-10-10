import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Exact 25-table target proposal recovered from the earlier ER discussion.
// This is a proposed future model, not the current Prisma schema.
const source = readFileSync('D:/ISE Project/Ise/tmp/erd/auth_25_original.mmd', 'utf8');
const output = 'D:/ISE Project/Ise/output/erd/ER_auth_25_target_chen.drawio';
const preview = 'D:/ISE Project/Ise/output/erd/ER_auth_25_target_chen_preview.svg';
const pageId = 'KrcABpA7rnhe3paQ9jrH';
const pageWidth = 10400;
const pageHeight = 8300;
const red = '#A92932';
const esc = (x) => String(x).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const models = new Map();
for (const match of source.matchAll(/^\s{4}(\w+) \{\r?\n([\s\S]*?)^\s{4}\}/gm)) {
  const [, name, body] = match;
  const attrs = [];
  for (const line of body.split(/\r?\n/)) {
    const field = line.trim().match(/^(\w+)\s+(\w+)(?:\s+([A-Z,]+))?$/);
    if (field) attrs.push({ type: field[1], name: field[2], flags: (field[3] || '').split(',').filter(Boolean) });
  }
  models.set(name, attrs);
}
if (models.size !== 25) throw new Error(`Expected 25 entities, found ${models.size}`);

const relationships = [];
for (const line of source.split(/\r?\n/)) {
  const relation = line.trim().match(/^(\w+)\s+(\|\||o\||o\{|\|\{)--(\|\||o\||o\{|\|\{)\s+(\w+)\s*:\s*(\w+)$/);
  if (relation) {
    const [, left, leftCard, rightCard, right, verb] = relation;
    if (!models.has(left) || !models.has(right)) throw new Error(`Bad relationship ${line}`);
    relationships.push({ left, leftCard, right, rightCard, verb });
  }
}
if (relationships.length !== 26) throw new Error(`Expected 26 relationships, found ${relationships.length}`);

// A radial Chen layout. Direct relationships with users form the inner ring;
// second-hop entities branch outward, so long user links do not pass through
// unrelated entity boxes. All 25 entities occupy the original single page.
const positions = new Map(Object.entries({
  users: [5000, 3600],
  user_roles: [2100, 3600],
  account_status_events: [2440, 2520],
  user_profiles: [3380, 1695],
  auth_identities: [4697, 1313],
  user_addresses: [6087, 1467],
  sessions: [7222, 2121],
  auth_events: [7836, 3122],
  one_time_tokens: [7787, 4234],
  mfa_factors: [7086, 5197],
  seller_profiles: [5896, 5787],
  kyc_decisions: [4497, 5865],
  audit_events: [3214, 5412],
  bulk_action_runs: [2350, 4535],
  roles: [800, 3600],
  role_permissions: [800, 2500],
  permissions: [800, 1400],
  refresh_tokens: [8800, 1700],
  kyc_applications: [6600, 7050],
  kyc_documents: [7900, 7800],
  seller_verifications: [7800, 5500],
  shop_change_requests: [8400, 6500],
  shop_change_request_items: [9600, 6500],
  bulk_action_items: [1000, 5100],
  outbox_events: [1000, 7000],
}));
if ([...models.keys()].some((name) => !positions.has(name))) throw new Error('Missing layout position');

const edges = [];
const nodes = [];
const svgEdges = [];
const svgNodes = [];
function vertex(id, value, x, y, w, h, style, parent = '1') {
  nodes.push(`<mxCell id="${esc(id)}" value="${esc(value)}" style="${esc(style)}" vertex="1" parent="${esc(parent)}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
}
function edge(id, sourceId, targetId, style) {
  edges.push(`<mxCell id="${esc(id)}" value="" style="${esc(style)}" edge="1" parent="1" source="${esc(sourceId)}" target="${esc(targetId)}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
}
function line(x1, y1, x2, y2, strokeWidth = 1.5) {
  svgEdges.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${red}" stroke-width="${strokeWidth}"/>`);
}
function text(value, x, y, size = 14, bold = false, underline = false) {
  svgNodes.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="${size}" font-weight="${bold ? 700 : 500}" fill="${red}"${underline ? ' text-decoration="underline"' : ''}>${esc(value)}</text>`);
}
const weak = new Set(['user_profiles', 'seller_profiles', 'role_permissions']);
const eW = 236;
const eH = 60;
const aW = 190;
const aH = 40;

vertex('diagram_title', 'AUTH SERVICE — TARGET CHEN ER DIAGRAM (25 TABLES)', 110, 65, 2500, 60,
  `text;html=1;strokeColor=none;fillColor=none;fontColor=${red};fontSize=32;fontStyle=1;fontFamily=Arial;align=left;verticalAlign=middle;`);
vertex('diagram_subtitle', 'Proposed future architecture · not the current 14-table database · ellipses = attributes · diamonds = relationships · double border = dependent entity', 112, 125, 4200, 36,
  'text;html=1;strokeColor=none;fillColor=none;fontColor=#74434A;fontSize=18;fontFamily=Arial;align=left;verticalAlign=middle;');
text('AUTH SERVICE — TARGET CHEN ER DIAGRAM (25 TABLES)', 1250, 95, 32, true);
text('Proposed future architecture · not the current 14-table database · ellipses = attributes · diamonds = relationships · double border = dependent entity', 2150, 157, 18);

function attributeSlots(count) {
  const order = ['top', 'bottom', 'left', 'right'];
  const n = Object.fromEntries(order.map((side) => [side, Math.floor(count / 4)]));
  for (let i = 0; i < count % 4; i++) n[order[i]]++;
  const slots = [];
  for (const side of order) for (let i = 0; i < n[side]; i++) {
    const offset = i - (n[side] - 1) / 2;
    if (side === 'top') slots.push([offset * 220, -188]);
    if (side === 'bottom') slots.push([offset * 220, 188]);
    if (side === 'left') slots.push([-470, offset * 100]);
    if (side === 'right') slots.push([470, offset * 100]);
  }
  return slots;
}

for (const [name, attrs] of models) {
  const [cx, cy] = positions.get(name);
  const box = `shape=rectangle;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=${red};strokeWidth=2.1;fontColor=${red};fontSize=20;fontStyle=1;fontFamily=Arial;align=center;verticalAlign=middle;`;
  vertex(`entity_${name}`, weak.has(name) ? '' : name, cx - eW / 2, cy - eH / 2, eW, eH, box);
  svgNodes.push(`<rect x="${cx - eW / 2}" y="${cy - eH / 2}" width="${eW}" height="${eH}" fill="white" stroke="${red}" stroke-width="2.1"/>`);
  if (weak.has(name)) {
    vertex(`entity_${name}_inner`, name, 8, 7, eW - 16, eH - 14,
      `shape=rectangle;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=${red};strokeWidth=1.7;fontColor=${red};fontSize=19;fontStyle=1;fontFamily=Arial;align=center;verticalAlign=middle;`, `entity_${name}`);
    svgNodes.push(`<rect x="${cx - eW / 2 + 8}" y="${cy - eH / 2 + 7}" width="${eW - 16}" height="${eH - 14}" fill="white" stroke="${red}" stroke-width="1.7"/>`);
  }
  text(name, cx, cy + 2, name.length > 20 ? 17 : 19, true);
  const slots = attributeSlots(attrs.length);
  attrs.forEach((a, i) => {
    const [dx, dy] = slots[i];
    const ax = cx + dx;
    const ay = cy + dy;
    const pk = a.flags.includes('PK');
    const label = a.name + (a.flags.includes('UK') ? ' [UK]' : '');
    const size = label.length > 20 ? 12 : label.length > 16 ? 13 : 15;
    const attrId = `attr_${name}_${a.name}`;
    vertex(attrId, label, ax - aW / 2, ay - aH / 2, aW, aH,
      `ellipse;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=${red};strokeWidth=1.6;fontColor=${red};fontSize=${size};fontStyle=${pk ? 5 : 0};fontFamily=Arial;align=center;verticalAlign=middle;`);
    edge(`edge_${attrId}`, `entity_${name}`, attrId,
      `edgeStyle=none;rounded=0;html=1;strokeColor=${red};strokeWidth=1.4;startArrow=none;endArrow=none;`);
    line(cx, cy, ax, ay, 1.4);
    svgNodes.push(`<ellipse cx="${ax}" cy="${ay}" rx="${aW / 2}" ry="${aH / 2}" fill="white" stroke="${red}" stroke-width="1.6"/>`);
    text(label, ax, ay + 1, size, pk, pk);
  });
}

function segHitsBox(a, b, c, halfX = 175, halfY = 90) {
  // Liang–Barsky clipping; true when the center-to-center route cuts a third entity.
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - (c[0] - halfX), (c[0] + halfX) - a[0], a[1] - (c[1] - halfY), (c[1] + halfY) - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    }
  }
  return t0 <= t1;
}
const diamondPositions = [];
function diamondPosition(rel) {
  const a = positions.get(rel.left), b = positions.get(rel.right);
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  let best;
  for (const t of [0.5, 0.38, 0.62, 0.28, 0.72]) for (const offset of [0, 230, -230, 460, -460, 700, -700, 950, -950]) {
    const d = [Math.round(a[0] + dx * t + nx * offset), Math.round(a[1] + dy * t + ny * offset)];
    if (d[0] < 150 || d[0] > pageWidth - 150 || d[1] < 230 || d[1] > pageHeight - 250) continue;
    let score = Math.abs(offset) * 0.7 + Math.abs(t - 0.5) * 400;
    for (const [name, c] of positions) {
      if (name === rel.left || name === rel.right) continue;
      if (segHitsBox(a, d, c) || segHitsBox(d, b, c)) score += 10000;
      const distance = Math.hypot(d[0] - c[0], d[1] - c[1]);
      if (distance < 260) score += 5000;
    }
    for (const old of diamondPositions) if (Math.hypot(d[0] - old[0], d[1] - old[1]) < 150) score += 2200;
    if (!best || score < best.score) best = { point: d, score };
  }
  diamondPositions.push(best.point);
  return best.point;
}
const card = { '||': '1', 'o|': '0..1', 'o{': '0..N', '|{': '1..N' };
relationships.forEach((rel, i) => {
  const a = positions.get(rel.left), b = positions.get(rel.right);
  const d = diamondPosition(rel);
  const id = `relationship_${i + 1}`;
  const width = 150, height = 88;
  const label = rel.verb.replaceAll('_', ' ');
  const size = label.length > 15 ? 11 : label.length > 10 ? 13 : 15;
  vertex(id, label, d[0] - width / 2, d[1] - height / 2, width, height,
    `rhombus;html=1;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=${red};strokeWidth=2;fontColor=${red};fontSize=${size};fontStyle=1;fontFamily=Arial;align=center;verticalAlign=middle;`);
  const route = `edgeStyle=none;rounded=0;html=1;strokeColor=${red};strokeWidth=2;startArrow=none;endArrow=none;`;
  edge(`${id}_left`, `entity_${rel.left}`, id, route);
  edge(`${id}_right`, id, `entity_${rel.right}`, route);
  line(a[0], a[1], d[0], d[1], 2);
  line(d[0], d[1], b[0], b[1], 2);
  svgNodes.push(`<polygon points="${d[0]},${d[1] - height / 2} ${d[0] + width / 2},${d[1]} ${d[0]},${d[1] + height / 2} ${d[0] - width / 2},${d[1]}" fill="white" stroke="${red}" stroke-width="2"/>`);
  text(label, d[0], d[1] + 1, size, true);
  for (const [side, from, to, value] of [['left', a, d, card[rel.leftCard]], ['right', b, d, card[rel.rightCard]]]) {
    const x = from[0] + (to[0] - from[0]) * 0.68;
    const y = from[1] + (to[1] - from[1]) * 0.68;
    const sx = to[0] - from[0], sy = to[1] - from[1], sl = Math.hypot(sx, sy);
    const px = Math.round(x - sy / sl * 25), py = Math.round(y + sx / sl * 25);
    vertex(`${id}_card_${side}`, value, px - 32, py - 14, 64, 28,
      `text;html=1;strokeColor=none;fillColor=#FFFFFF;fontColor=${red};fontSize=17;fontStyle=1;fontFamily=Arial;align=center;verticalAlign=middle;`);
    text(value, px, py, 17, true);
  }
});

vertex('diagram_footer', 'PK underlined · [UK] = unique key · 0..N / 1..N show optional or mandatory multiplicity · outbox_events is intentionally standalone in the original proposal', 100, 8160, 5500, 42,
  'text;html=1;strokeColor=none;fillColor=none;fontColor=#74434A;fontSize=18;fontFamily=Arial;align=left;verticalAlign=middle;');
text('PK underlined · [UK] = unique key · 0..N / 1..N show multiplicity · outbox_events is intentionally standalone in the original proposal', 2650, 8190, 18);

const graph = `<mxGraphModel dx="1500" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${edges.join('')}${nodes.join('')}</root></mxGraphModel>`;
const drawio = `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="Codex" version="24.7.17"><diagram name="หน้า-1" id="${pageId}">${graph}</diagram></mxfile>\n`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}"><rect width="100%" height="100%" fill="white"/>${svgEdges.join('')}${svgNodes.join('')}</svg>`;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, drawio, 'utf8');
writeFileSync(preview, svg, 'utf8');
console.log(JSON.stringify({ output, preview, tables: models.size, attributes: [...models.values()].reduce((n, attrs) => n + attrs.length, 0), relationships: relationships.length, bytes: Buffer.byteLength(drawio) }));
