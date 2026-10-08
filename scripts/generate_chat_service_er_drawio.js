const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const DRAWIO_PATH = path.join(ROOT, "docs", "chat-service-er-chen.drawio");
const PREVIEW_PATH = path.join(ROOT, "docs", "chat-service-er-chen-preview.png");
const WIDTH = 4600;
const HEIGHT = 3200;

const entities = [
  {
    id: "conversation", name: "CONVERSATION", x: 900, y: 1600, featured: true,
    attrs: [
      ["conversation_id", "PK · ObjectId (_id)", "pk"],
      ["context_type", "PRODUCT | ORDER | SUPPORT | DIRECT", "normal"],
      ["context_id", "nullable · Product/Order/SupportTicket", "soft"],
      ["context_key", "UK · string", "uk"],
      ["status", "ACTIVE | ARCHIVED | LOCKED", "normal"],
      ["last_message_at", "datetime · nullable · stored snapshot", "optional"],
      ["last_message_preview", "string · nullable · stored snapshot", "optional"],
      ["created_by", "Auth/service", "soft"],
      ["created_at", "datetime", "normal"],
      ["updated_at", "datetime", "normal"],
    ],
  },
  {
    id: "participant", name: "PARTICIPANT", x: 2850, y: 800, weak: true,
    attrs: [
      ["user_id", "partial key · Auth", "partial-soft"],
      ["role", "BUYER | SELLER | AGENT | ADMIN | SYSTEM", "normal"],
      ["joined_at", "partial key · datetime", "partial"],
      ["last_read_at", "datetime · nullable", "optional"],
      ["left_at", "datetime · nullable", "optional"],
    ],
  },
  {
    id: "message", name: "MESSAGE", x: 2900, y: 2350,
    attrs: [
      ["message_id", "PK · ObjectId (_id)", "pk"],
      ["conversation_id", "FK · ObjectId", "fk"],
      ["sender_id", "Auth/service", "soft"],
      ["sender_role", "string", "normal"],
      ["type", "TEXT | IMAGE | FILE | PRODUCT_CARD | ORDER_CARD | SYSTEM", "normal"],
      ["body", "string · default empty", "normal"],
      ["payload", "JSON · nullable", "optional"],
      ["visibility", "ALL | INTERNAL", "normal"],
      ["edited_at", "datetime · nullable", "optional"],
      ["deleted_at", "datetime · nullable · soft delete", "optional"],
      ["created_at", "datetime", "normal"],
      ["sync_status", "string · nullable", "optional"],
      ["synced_at", "datetime · nullable", "optional"],
      ["sync_attempts", "integer · default 0", "normal"],
      ["next_retry_at", "datetime · nullable", "optional"],
      ["last_sync_error", "string · nullable", "optional"],
    ],
  },
];

const relations = [
  {
    id: "embeds", label: "embeds", identifying: true,
    source: "conversation", target: "participant", x: 2000, y: 790,
    sourceCard: "1", targetCard: "N",
    sourcePoints: [[1650, 1600], [1650, 790]], targetPoints: [[2350, 790]],
  },
  {
    id: "contains", label: "contains", identifying: false,
    source: "conversation", target: "message", x: 2000, y: 2330,
    sourceCard: "1", targetCard: "N",
    sourcePoints: [[1650, 1600], [1650, 2330]], targetPoints: [[2250, 2330]],
  },
];

const entityById = new Map(entities.map((e) => [e.id, e]));
const cells = [];
const svgShapes = [];
const svgEdges = [];

const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const svgEsc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function vertex(id, value, style, x, y, w, h) {
  cells.push(`        <mxCell id="${id}" value="${esc(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
}
function edge(id, source, target, value, style, points = []) {
  const pts = points.length ? `<Array as="points">${points.map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join("")}</Array>` : "";
  cells.push(`        <mxCell id="${id}" value="${esc(value)}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry">${pts}</mxGeometry></mxCell>`);
}

const entityStyle = "rounded=0;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=2.5;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=18;fontStyle=1;align=center;verticalAlign=middle;";
const featuredStyle = entityStyle.replace("strokeWidth=2.5", "strokeWidth=4");
const weakOuter = "rounded=0;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=2.8;fillColor=#ffffff;";
const weakInner = "rounded=0;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=1.8;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=18;fontStyle=1;align=center;verticalAlign=middle;";
const relationStyle = "rhombus;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=2.2;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=14;fontStyle=1;align=center;verticalAlign=middle;";
const relationOuter = "rhombus;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=2.5;fillColor=#ffffff;";
const relationInner = relationStyle.replace("strokeWidth=2.2", "strokeWidth=1.5");
const attrEdge = "edgeStyle=none;html=1;strokeColor=#777777;strokeWidth=1.1;endArrow=none;startArrow=none;";
const relEdge = "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#111111;strokeWidth=2;endArrow=none;startArrow=none;fontColor=#111111;fontFamily=Arial;fontSize=16;fontStyle=1;labelBackgroundColor=#ffffff;";

function attrStyle(type) {
  const base = "ellipse;whiteSpace=wrap;html=1;strokeColor=#444444;strokeWidth=1.5;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=13;align=center;verticalAlign=middle;";
  return type === "pk" ? base.replace("strokeWidth=1.5", "strokeWidth=2.3") : base;
}
function attrValue(name, detail, type) {
  let label = name;
  if (type === "pk") label = `<u>${name}</u>`;
  if (type === "partial" || type === "partial-soft") label = `<span style="border-bottom:1px dashed #111111;">${name}</span>`;
  const soft = type === "soft" || type === "partial-soft" ? " · (soft ref)" : "";
  return `${label}<br><font color="#444444" style="font-size:11px">${detail}${soft}</font>`;
}
function attrPoint(entity, i) {
  const n = entity.attrs.length;
  // Half-step rotation on the dense MESSAGE orbit leaves a clean horizontal
  // corridor for the CONVERSATION—contains—MESSAGE relationship line.
  const angle = -Math.PI / 2 + (n >= 15 ? Math.PI / n : 0) + (2 * Math.PI * i) / n;
  const rx = n >= 15 ? 720 : n >= 9 ? 540 : 420;
  const ry = n >= 15 ? 560 : n >= 9 ? 430 : 320;
  return { x: Math.round(entity.x + Math.cos(angle) * rx), y: Math.round(entity.y + Math.sin(angle) * ry) };
}

vertex("title", "<b>Chat Service — E-R Diagram</b>", "text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Arial;fontSize=34;fontColor=#111111;", 80, 40, 1800, 55);
vertex("subtitle", "Chen notation · MongoDB · all persisted scalar fields · one continuous canvas", "text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Arial;fontSize=17;fontColor=#444444;", 82, 95, 2100, 35);

for (const entity of entities) {
  const w = entity.featured ? 280 : 250;
  const h = entity.featured ? 92 : 80;
  if (entity.weak) {
    vertex(entity.id, "", weakOuter, entity.x - w / 2, entity.y - h / 2, w, h);
    vertex(`${entity.id}-inner`, `<b>${entity.name}</b>`, weakInner, entity.x - w / 2 + 8, entity.y - h / 2 + 8, w - 16, h - 16);
  } else vertex(entity.id, `<b>${entity.name}</b>`, entity.featured ? featuredStyle : entityStyle, entity.x - w / 2, entity.y - h / 2, w, h);
  svgShapes.push({ type: "entity", entity, x: entity.x - w / 2, y: entity.y - h / 2, w, h });

  entity.attrs.forEach(([name, detail, type], i) => {
    const p = attrPoint(entity, i);
    const wAttr = Math.max(210, Math.min(350, 105 + Math.max(name.length * 8, detail.length * 3.4)));
    const hAttr = 72;
    const id = `${entity.id}-attr-${i + 1}`;
    vertex(id, attrValue(name, detail, type), attrStyle(type), p.x - wAttr / 2, p.y - hAttr / 2, wAttr, hAttr);
    edge(`${id}-edge`, id, entity.id, "", attrEdge);
    svgEdges.push({ kind: "attr", points: [[p.x, p.y], [entity.x, entity.y]] });
    svgShapes.push({ type: "attr", name, detail, attrType: type, x: p.x - wAttr / 2, y: p.y - hAttr / 2, w: wAttr, h: hAttr });
  });
}

for (const r of relations) {
  const id = `rel-${r.id}`;
  if (r.identifying) {
    vertex(id, "", relationOuter, r.x - 78, r.y - 50, 156, 100);
    vertex(`${id}-inner`, r.label, relationInner, r.x - 69, r.y - 41, 138, 82);
  } else vertex(id, r.label, relationStyle, r.x - 78, r.y - 50, 156, 100);
  edge(`${id}-source`, r.source, id, r.sourceCard, relEdge, r.sourcePoints);
  edge(`${id}-target`, id, r.target, r.targetCard, relEdge, r.targetPoints);
  const s = entityById.get(r.source), t = entityById.get(r.target);
  svgEdges.push({ kind: "rel", label: r.sourceCard, points: [[s.x, s.y], ...r.sourcePoints, [r.x, r.y]] });
  svgEdges.push({ kind: "rel", label: r.targetCard, points: [[r.x, r.y], ...r.targetPoints, [t.x, t.y]] });
  svgShapes.push({ type: "rel", label: r.label, identifying: r.identifying, x: r.x - 78, y: r.y - 50, w: 156, h: 100 });
}

// Compact legend and implementation note; neither partitions the canvas.
vertex("legend-title", "<b>CHEN NOTATION</b>", "text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Arial;fontSize=16;fontColor=#111111;", 3650, 180, 300, 35);
vertex("legend-weak", "", weakOuter, 3650, 230, 220, 68);
vertex("legend-weak-inner", "WEAK ENTITY", weakInner, 3658, 238, 204, 52);
vertex("legend-pk", "<u>message_id</u><br><font color=\"#444444\" style=\"font-size:11px\">primary key</font>", attrStyle("pk"), 3910, 220, 250, 72);
vertex("legend-partial", "<span style=\"border-bottom:1px dashed #111111;\">user_id</span><br><font color=\"#444444\" style=\"font-size:11px\">partial key</font>", attrStyle("partial"), 4200, 220, 250, 72);
vertex("note", "PARTICIPANT is embedded in CONVERSATION. Its logical identity is owner conversation + (user_id, joined_at); MongoDB stores no separate participant _id.", "rounded=1;whiteSpace=wrap;html=1;strokeColor=#666666;strokeWidth=1.5;fillColor=#ffffff;fontColor=#222222;fontFamily=Arial;fontSize=14;align=left;spacingLeft=14;spacingRight=14;", 3500, 340, 950, 105);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2026-09-23T00:00:00.000Z" agent="Codex" version="24.7.17" type="device">
  <diagram id="chat-service-chen" name="Chat Service ER — Complete Chen">
    <mxGraphModel dx="${WIDTH}" dy="${HEIGHT}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${WIDTH}" pageHeight="${HEIGHT}" math="0" shadow="0">
      <root><mxCell id="0"/><mxCell id="1" parent="0"/>
${cells.join("\n")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`, `<rect width="100%" height="100%" fill="#ffffff"/>`, `<text x="80" y="80" font-family="Arial" font-size="42" font-weight="700" fill="#111111">Chat Service — E-R Diagram</text>`, `<text x="82" y="120" font-family="Arial" font-size="20" fill="#444444">Chen notation · MongoDB · all persisted scalar fields · one continuous canvas</text>`];
for (const e of svgEdges) {
  svg.push(`<polyline points="${e.points.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${e.kind === "attr" ? "#888888" : "#111111"}" stroke-width="${e.kind === "attr" ? 1.2 : 2.2}"/>`);
  if (e.label) { const p = e.points[Math.min(1, e.points.length - 1)]; svg.push(`<rect x="${p[0]-18}" y="${p[1]-18}" width="36" height="28" rx="5" fill="#ffffff"/><text x="${p[0]}" y="${p[1]+3}" text-anchor="middle" font-family="Arial" font-size="17" font-weight="700">${svgEsc(e.label)}</text>`); }
}
for (const s of svgShapes) {
  if (s.type === "entity") {
    svg.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="#ffffff" stroke="#111111" stroke-width="${s.entity.featured ? 4 : 3}"/>`);
    if (s.entity.weak) svg.push(`<rect x="${s.x+8}" y="${s.y+8}" width="${s.w-16}" height="${s.h-16}" fill="none" stroke="#111111" stroke-width="2"/>`);
    svg.push(`<text x="${s.entity.x}" y="${s.entity.y+6}" text-anchor="middle" font-family="Arial" font-size="19" font-weight="700">${s.entity.name}</text>`);
  } else if (s.type === "attr") {
    svg.push(`<ellipse cx="${s.x+s.w/2}" cy="${s.y+s.h/2}" rx="${s.w/2}" ry="${s.h/2}" fill="#ffffff" stroke="#333333" stroke-width="${s.attrType === "pk" ? 2.4 : 1.6}"/>`);
    svg.push(`<text x="${s.x+s.w/2}" y="${s.y+30}" text-anchor="middle" font-family="Arial" font-size="14" font-weight="600"${s.attrType === "pk" ? ' text-decoration="underline"' : ""}>${svgEsc(s.name)}</text>`);
    if (s.attrType.includes("partial")) svg.push(`<line x1="${s.x+s.w*.30}" y1="${s.y+35}" x2="${s.x+s.w*.70}" y2="${s.y+35}" stroke="#111111" stroke-width="1.5" stroke-dasharray="7 5"/>`);
    const soft = s.attrType.includes("soft") ? " · (soft ref)" : "";
    svg.push(`<text x="${s.x+s.w/2}" y="${s.y+53}" text-anchor="middle" font-family="Arial" font-size="11" fill="#444444">${svgEsc(s.detail + soft)}</text>`);
  } else {
    const cx=s.x+s.w/2, cy=s.y+s.h/2;
    svg.push(`<polygon points="${cx},${s.y} ${s.x+s.w},${cy} ${cx},${s.y+s.h} ${s.x},${cy}" fill="#ffffff" stroke="#111111" stroke-width="3"/>`);
    if (s.identifying) svg.push(`<polygon points="${cx},${s.y+9} ${s.x+s.w-9},${cy} ${cx},${s.y+s.h-9} ${s.x+9},${cy}" fill="none" stroke="#111111" stroke-width="2"/>`);
    svg.push(`<text x="${cx}" y="${cy+5}" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700">${svgEsc(s.label)}</text>`);
  }
}
svg.push(`</svg>`);

fs.writeFileSync(DRAWIO_PATH, xml, "utf8");
sharp(Buffer.from(svg.join("\n"))).resize({ width: 2400 }).png().toFile(PREVIEW_PATH)
  .then(() => { console.log(`Wrote ${DRAWIO_PATH}`); console.log(`Wrote ${PREVIEW_PATH}`); })
  .catch((error) => { console.error(error); process.exitCode = 1; });
