const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "backend/services/support-service/prisma/schema.prisma");
const drawioPath = path.join(root, "docs/customer-service-current-code-er.drawio");
const previewPath = path.join(root, "docs/customer-service-current-code-er-preview.png");
const width = 4700;
const height = 4450;

const placements = {
  SupportTicket: {
    cx: 1450, cy: 1450,
    positions: [
      ...[460, 750, 1040, 1330, 1620, 1910, 2200, 2490].map((x) => [x, 390]),
      ...[690, 910, 1130, 1350, 1570, 1790, 2010, 2230].map((y) => [370, y]),
      ...[550, 850, 1150, 1450, 1750, 2050, 2350].map((x) => [x, 2510]),
    ],
  },
  TicketMessage: {
    cx: 3800, cy: 800,
    positions: [
      ...[3300, 3630, 3960, 4290].map((x) => [x, 350]),
      ...[3300, 3630, 3960, 4290].map((x) => [x, 1300]),
    ],
  },
  TicketAuditLog: {
    cx: 3800, cy: 2200,
    positions: [
      ...[3300, 3630, 3960, 4290].map((x) => [x, 1720]),
      ...[3180, 3490, 3800, 4110, 4420].map((x) => [x, 2760]),
    ],
  },
  HelpArticle: {
    cx: 1450, cy: 3660,
    positions: [
      ...[700, 1000, 1300, 1600, 1900, 2200].map((x) => [x, 3170]),
      ...[700, 1000, 1300, 1600, 1900, 2200].map((x) => [x, 4150]),
    ],
  },
};

const softReferences = {
  SupportTicket: {
    requesterId: "Auth", assigneeId: "Auth", orderId: "Order",
    targetId: "Auth", conversationId: "Chat",
  },
  TicketMessage: { authorId: "Auth", chatMessageId: "Chat" },
  TicketAuditLog: { actorId: "Auth" },
  HelpArticle: { authorId: "Auth" },
};

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function parseSchema(source) {
  const models = [];
  const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  for (const match of source.matchAll(modelPattern)) {
    const [, name, body] = match;
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1] || name;
    const foreignFields = new Set(
      [...body.matchAll(/@relation\(fields:\s*\[([^\]]+)\]/g)]
        .flatMap((relation) => relation[1].split(",").map((field) => field.trim())),
    );
    const fields = [];
    for (const line of body.split(/\r?\n/)) {
      const fieldMatch = line.match(/^\s{2}(\w+)\s+(String|Int|DateTime|Boolean)(\?)?(?=\s|$)(.*)$/);
      if (!fieldMatch) continue;
      const [, field, type, optional, rest] = fieldMatch;
      const column = rest.match(/@map\("([^"]+)"\)/)?.[1] || field;
      const key = rest.includes("@id") ? "PK" : rest.includes("@unique") ? "UK" : "";
      fields.push({ field, column, type, optional: Boolean(optional), key,
        foreign: foreignFields.has(field), soft: softReferences[name]?.[field] || "" });
    }
    models.push({ name, table, fields });
  }
  return models;
}

const models = parseSchema(fs.readFileSync(schemaPath, "utf8"));
if (models.length !== 4 || models.reduce((sum, model) => sum + model.fields.length, 0) !== 52) {
  throw new Error("Current support-service schema changed: review the ER layout before regenerating");
}
for (const model of models) {
  if (!placements[model.name] || model.fields.length !== placements[model.name].positions.length) {
    throw new Error(`Missing layout for ${model.name}`);
  }
}

const cells = [];
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  '<rect width="100%" height="100%" fill="white"/>'];
const entityStyle = "rounded=0;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=3;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=24;fontStyle=1;align=center;verticalAlign=middle;";
const relationStyle = "rhombus;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=2.5;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=18;fontStyle=1;align=center;verticalAlign=middle;";
const attributeEdgeStyle = "edgeStyle=none;html=1;strokeColor=#777777;strokeWidth=1.4;endArrow=none;startArrow=none;";
const relationEdgeStyle = "edgeStyle=none;html=1;strokeColor=#111111;strokeWidth=2.5;fontColor=#111111;fontFamily=Arial;fontSize=20;fontStyle=1;labelBackgroundColor=#ffffff;endArrow=none;startArrow=none;";

function vertex(id, value, style, x, y, w, h) {
  cells.push(`        <mxCell id="${id}" value="${xmlEscape(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
}

function edge(id, source, target, value, style) {
  cells.push(`        <mxCell id="${id}" value="${xmlEscape(value)}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
}

function attributeDetail(attr) {
  const tags = [];
  if (attr.key) tags.push(attr.key);
  if (attr.foreign) tags.push("FK");
  if (attr.soft) tags.push(`soft ref: ${attr.soft}`);
  tags.push(attr.type);
  if (attr.optional) tags.push("nullable");
  return tags.join(" · ");
}

function textLines(value, maxChars = 26) {
  const parts = value.split(" · ");
  const lines = [];
  let current = "";
  for (const part of parts) {
    const next = current ? `${current} · ${part}` : part;
    if (current && next.length > maxChars) { lines.push(current); current = part; }
    else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

vertex("title", "<b>CUSTOMER SERVICE — AS-IS DATABASE ER</b>",
  "text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Arial;fontSize=37;fontColor=#111111;", 105, 45, 3300, 60);
vertex("subtitle", "Current support-service Prisma schema · 4 physical tables · 52 columns · Chen notation",
  "text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Arial;fontSize=21;fontColor=#333333;", 105, 108, 3500, 42);
svg.push('<text x="105" y="88" font-family="Arial" font-size="43" font-weight="700">CUSTOMER SERVICE — AS-IS DATABASE ER</text>');
svg.push('<text x="105" y="143" font-family="Arial" font-size="23">Current support-service Prisma schema · 4 physical tables · 52 columns · Chen notation</text>');

for (const model of models) {
  const layout = placements[model.name];
  const entityId = `entity-${model.table}`;
  const entityWidth = model.name === "SupportTicket" ? 330 : 300;
  const entityHeight = 96;
  vertex(entityId, `<b>${model.table.toUpperCase()}</b>`, entityStyle,
    layout.cx - entityWidth / 2, layout.cy - entityHeight / 2, entityWidth, entityHeight);
  for (const [index, attr] of model.fields.entries()) {
    const [cx, cy] = layout.positions[index];
    const id = `${model.table}-attribute-${index + 1}`;
    const detailLines = textLines(attributeDetail(attr));
    const name = attr.key === "PK" ? `<u>${attr.column}</u>` : attr.column;
    const detail = detailLines.join("<br>");
    const style = `ellipse;whiteSpace=wrap;html=1;strokeColor=${attr.soft ? "#555555" : "#111111"};strokeWidth=${attr.key === "PK" ? "2.2" : "1.6"};${attr.soft ? "dashed=1;dashPattern=5 4;" : ""}fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=19;align=center;verticalAlign=middle;spacing=2;`;
    const value = `${name}<br><font color="#333333" style="font-size:14px">${detail}</font>`;
    vertex(id, value, style, cx - 125, cy - 42, 250, 84);
    edge(`${id}-line`, id, entityId, "", attributeEdgeStyle);
    svg.push(`<line x1="${cx}" y1="${cy}" x2="${layout.cx}" y2="${layout.cy}" stroke="#999" stroke-width="1.6"/>`);
  }
  svg.push(`<rect x="${layout.cx - entityWidth / 2}" y="${layout.cy - entityHeight / 2}" width="${entityWidth}" height="${entityHeight}" fill="white" stroke="#111" stroke-width="3"/>`);
  svg.push(`<text x="${layout.cx}" y="${layout.cy + 7}" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700">${model.table.toUpperCase()}</text>`);
  for (const [index, attr] of model.fields.entries()) {
    const [cx, cy] = layout.positions[index];
    const detailLines = textLines(attributeDetail(attr));
    svg.push(`<ellipse cx="${cx}" cy="${cy}" rx="125" ry="42" fill="white" stroke="${attr.soft ? "#555" : "#111"}" stroke-width="${attr.key === "PK" ? 2.2 : 1.6}" ${attr.soft ? 'stroke-dasharray="6 5"' : ""}/>`);
    const y = cy - (detailLines.length === 1 ? 7 : 15);
    svg.push(`<text x="${cx}" y="${y}" text-anchor="middle" font-family="Arial" font-size="19" ${attr.key === "PK" ? 'text-decoration="underline"' : ""}>${xmlEscape(attr.column)}</text>`);
    detailLines.forEach((line, lineIndex) => svg.push(`<text x="${cx}" y="${y + 19 + lineIndex * 15}" text-anchor="middle" font-family="Arial" font-size="13" fill="#333">${xmlEscape(line)}</text>`));
  }
}

for (const rel of [
  { id: "messages", label: "contains", child: "ticket_messages", cx: 2820, cy: 800 },
  { id: "audit", label: "records", child: "ticket_audit_logs", cx: 2820, cy: 2200 },
]) {
  const relId = `relation-${rel.id}`;
  vertex(relId, rel.label, relationStyle, rel.cx - 92, rel.cy - 60, 184, 120);
  edge(`${relId}-parent`, "entity-support_tickets", relId, "1", relationEdgeStyle);
  edge(`${relId}-child`, relId, `entity-${rel.child}`, "0..N", relationEdgeStyle);
  svg.push(`<line x1="1615" y1="1450" x2="${rel.cx - 92}" y2="${rel.cy}" stroke="#111" stroke-width="3"/>`);
  svg.push(`<line x1="${rel.cx + 92}" y1="${rel.cy}" x2="3650" y2="${rel.id === "messages" ? 800 : 2200}" stroke="#111" stroke-width="3"/>`);
  svg.push(`<polygon points="${rel.cx},${rel.cy - 60} ${rel.cx + 92},${rel.cy} ${rel.cx},${rel.cy + 60} ${rel.cx - 92},${rel.cy}" fill="white" stroke="#111" stroke-width="2.5"/>`);
  svg.push(`<text x="${rel.cx}" y="${rel.cy + 6}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700">${rel.label}</text>`);
  svg.push(`<text x="${rel.cx - 350}" y="${rel.cy + (rel.id === "messages" ? 155 : -155)}" text-anchor="middle" font-family="Arial" font-size="23" font-weight="700" fill="#111">1</text>`);
  svg.push(`<text x="${rel.cx + 300}" y="${rel.cy - 22}" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" fill="#111">0..N</text>`);
}

vertex("note", "<b>AS-IS ONLY:</b> no separate setup tables. Category, status and priority are String columns on support_tickets. Dashed ovals = cross-service soft references (not database FKs).",
  "rounded=1;whiteSpace=wrap;html=1;strokeColor=#777777;fillColor=#ffffff;fontColor=#222222;fontFamily=Arial;fontSize=19;align=left;verticalAlign=middle;spacingLeft=20;", 2600, 3440, 1770, 180);
svg.push('<rect x="2600" y="3440" width="1770" height="180" rx="14" fill="white" stroke="#777" stroke-width="2"/>');
svg.push('<text x="2630" y="3485" font-family="Arial" font-size="22" font-weight="700">AS-IS ONLY</text>');
svg.push('<text x="2630" y="3525" font-family="Arial" font-size="19">No separate setup tables: category, status, priority</text>');
svg.push('<text x="2630" y="3556" font-family="Arial" font-size="19">are String columns on support_tickets.</text>');
svg.push('<text x="2630" y="3587" font-family="Arial" font-size="19">Dashed ovals = cross-service soft references.</text>');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="Codex" type="device">\n  <diagram id="customer-service-as-is" name="CS As-Is — current code">\n    <mxGraphModel dx="${width}" dy="${height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1650" pageHeight="1167" pageBreaks="1" math="0" shadow="0">\n      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n${cells.join("\n")}\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n`;
fs.writeFileSync(drawioPath, xml, "utf8");
svg.push("</svg>");
sharp(Buffer.from(svg.join("\n"))).resize({ width: 2350 }).png().toFile(previewPath)
  .then(() => console.log(`Wrote ${drawioPath} and ${previewPath}`))
  .catch((error) => { console.error(error); process.exitCode = 1; });
