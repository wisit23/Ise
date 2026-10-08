const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const DRAWIO_PATH = path.join(ROOT, "docs", "customer-service-er-chen.drawio");
const PREVIEW_PATH = path.join(ROOT, "docs", "customer-service-er-chen-preview.png");

const WIDTH = 7000;
const HEIGHT = 5600;

const entities = [
  {
    id: "ticket-category", name: "TICKET_CATEGORY", x: 1000, y: 650,
    attrs: [
      ["ticket_category_id", "PK · smallint", "pk"], ["code", "UK · varchar(30)", "uk"],
      ["name_th", "varchar(100)", "normal"], ["name_en", "varchar(100) · nullable", "optional"],
      ["is_active", "boolean", "normal"], ["created_at", "timestamptz", "normal"],
      ["updated_at", "timestamptz", "normal"],
    ],
  },
  {
    id: "ticket-priority", name: "TICKET_PRIORITY", x: 2500, y: 650,
    attrs: [
      ["ticket_priority_id", "PK · smallint", "pk"], ["code", "UK · varchar(20)", "uk"],
      ["name", "varchar(100)", "normal"], ["rank", "UK · smallint", "uk"],
      ["is_active", "boolean", "normal"], ["created_at", "timestamptz", "normal"],
      ["updated_at", "timestamptz", "normal"],
    ],
  },
  {
    id: "ticket-status", name: "TICKET_STATUS", x: 4000, y: 650,
    attrs: [
      ["ticket_status_id", "PK · smallint", "pk"], ["code", "UK · varchar(30)", "uk"],
      ["name", "varchar(100)", "normal"], ["is_terminal", "boolean", "normal"],
      ["sort_order", "smallint", "normal"], ["created_at", "timestamptz", "normal"],
      ["updated_at", "timestamptz", "normal"],
    ],
  },
  {
    id: "sla-policy", name: "SLA_POLICY", x: 6000, y: 650,
    attrs: [
      ["sla_policy_id", "PK · uuid", "pk"], ["ticket_category_id", "FK · nullable", "fk"],
      ["ticket_priority_id", "FK", "fk"], ["first_response_minutes", "integer", "normal"],
      ["resolution_minutes", "integer", "normal"], ["effective_from", "timestamptz", "normal"],
      ["effective_to", "timestamptz · nullable", "optional"], ["created_at", "timestamptz", "normal"],
    ],
  },
  {
    id: "ticket-assignment", name: "TICKET_ASSIGNMENT", x: 700, y: 2050,
    attrs: [
      ["assignment_id", "PK · uuid", "pk"], ["ticket_id", "FK", "fk"],
      ["assignee_id", "soft ref · Auth", "soft"], ["assigned_by_id", "soft ref · Auth", "soft"],
      ["assigned_at", "timestamptz", "normal"], ["ended_at", "timestamptz · nullable", "optional"],
      ["end_reason", "varchar(200) · nullable", "optional"],
    ],
  },
  {
    id: "support-ticket", name: "SUPPORT_TICKET", x: 2700, y: 2050, featured: true,
    attrs: [
      ["ticket_id", "PK · uuid", "pk"], ["ticket_number", "UK · varchar(20)", "uk"],
      ["requester_id", "soft ref · Auth", "soft"], ["subject", "varchar(200)", "normal"],
      ["description", "text", "normal"], ["ticket_category_id", "FK", "fk"],
      ["ticket_priority_id", "FK", "fk"], ["current_status_id", "FK", "fk"],
      ["order_id", "soft ref · Order · nullable", "soft"], ["target_user_id", "soft ref · Auth · nullable", "soft"],
      ["lock_version", "integer", "normal"], ["created_at", "timestamptz", "normal"],
      ["updated_at", "timestamptz", "normal"],
    ],
  },
  {
    id: "ticket-status-history", name: "TICKET_STATUS_HISTORY", x: 4450, y: 2050,
    attrs: [
      ["status_history_id", "PK · uuid", "pk"], ["ticket_id", "FK", "fk"],
      ["from_status_id", "FK · nullable", "fk"], ["to_status_id", "FK", "fk"],
      ["changed_by_id", "soft ref · Auth/service", "soft"], ["reason", "text · nullable", "optional"],
      ["created_at", "timestamptz", "normal"],
    ],
  },
  {
    id: "ticket-sla-target", name: "TICKET_SLA_TARGET", x: 6300, y: 2050,
    attrs: [
      ["sla_target_id", "PK · uuid", "pk"], ["ticket_id", "FK", "fk"],
      ["sla_policy_id", "FK", "fk"], ["metric_type", "varchar(30)", "normal"],
      ["due_at", "timestamptz", "normal"], ["achieved_at", "timestamptz · nullable", "optional"],
      ["breached_at", "timestamptz · nullable", "optional"], ["created_at", "timestamptz", "normal"],
      ["updated_at", "timestamptz", "normal"],
    ],
  },
  {
    id: "ticket-message", name: "TICKET_MESSAGE", x: 900, y: 3500,
    attrs: [
      ["message_id", "PK · uuid", "pk"], ["ticket_id", "FK", "fk"],
      ["author_id", "soft ref · Auth/service", "soft"], ["author_role", "varchar(30)", "normal"],
      ["body", "text", "normal"], ["is_internal", "boolean", "normal"],
      ["chat_message_id", "UK · soft ref · nullable", "soft"], ["created_at", "timestamptz", "normal"],
    ],
  },
  {
    id: "ticket-audit-event", name: "TICKET_AUDIT_EVENT", x: 2500, y: 3500,
    attrs: [
      ["audit_event_id", "PK · uuid", "pk"], ["ticket_id", "FK", "fk"],
      ["actor_id", "soft ref · Auth/service", "soft"], ["event_type", "varchar(40)", "normal"],
      ["dedupe_key", "UK · varchar(150) · nullable", "uk"], ["payload", "jsonb", "normal"],
      ["created_at", "timestamptz", "normal"],
    ],
  },
  {
    id: "ticket-chat-link", name: "TICKET_CHAT_LINK", x: 4100, y: 3500, weak: true,
    attrs: [
      ["ticket_id", "PK · FK · owner key", "pk"],
      ["conversation_id", "UK · soft ref · Chat", "soft"],
      ["linked_at", "timestamptz", "normal"],
    ],
  },
  {
    id: "help-category", name: "HELP_CATEGORY", x: 5900, y: 3500,
    attrs: [
      ["help_category_id", "PK · smallint", "pk"], ["code", "UK · varchar(30)", "uk"],
      ["name_th", "varchar(100)", "normal"], ["name_en", "varchar(100) · nullable", "optional"],
      ["is_active", "boolean", "normal"], ["created_at", "timestamptz", "normal"],
      ["updated_at", "timestamptz", "normal"],
    ],
  },
  {
    id: "help-article", name: "HELP_ARTICLE", x: 2600, y: 4950,
    attrs: [
      ["article_id", "PK · uuid", "pk"], ["slug", "UK · varchar(160)", "uk"],
      ["status", "varchar(20)", "normal"], ["published_version", "integer · nullable", "optional"],
      ["created_by_id", "soft ref · Auth", "soft"], ["created_at", "timestamptz", "normal"],
      ["updated_at", "timestamptz", "normal"],
    ],
  },
  {
    id: "help-article-revision", name: "HELP_ARTICLE_REVISION", x: 4700, y: 4950, weak: true,
    attrs: [
      ["article_id", "PK · FK · owner key", "pk"], ["version", "PK · partial key", "partial"],
      ["help_category_id", "FK", "fk"], ["title", "varchar(250)", "normal"],
      ["body", "text", "normal"], ["author_id", "soft ref · Auth", "soft"],
      ["search_text", "derived · text", "derived"], ["created_at", "timestamptz", "normal"],
    ],
  },
];

const relations = [
  { label: "classifies", source: "ticket-category", target: "support-ticket", sourceCard: "1", targetCard: "N", x: 1750, y: 1350 },
  { label: "prioritizes", source: "ticket-priority", target: "support-ticket", sourceCard: "1", targetCard: "N", x: 2550, y: 1350 },
  { label: "current state", source: "ticket-status", target: "support-ticket", sourceCard: "1", targetCard: "N", x: 3400, y: 1350 },
  { label: "has assignments", source: "support-ticket", target: "ticket-assignment", sourceCard: "1", targetCard: "N", x: 1650, y: 2050 },
  { label: "has transitions", source: "support-ticket", target: "ticket-status-history", sourceCard: "1", targetCard: "N", x: 3550, y: 2050 },
  { label: "uses status", source: "ticket-status", target: "ticket-status-history", sourceCard: "1", targetCard: "N", x: 4300, y: 1350 },
  {
    label: "policy priority", source: "ticket-priority", target: "sla-policy", sourceCard: "1", targetCard: "N", x: 4300, y: 260,
    sourcePoints: [[2500, 300], [4300, 260]], targetPoints: [[4300, 260], [6000, 300]],
  },
  {
    label: "policy category", source: "ticket-category", target: "sla-policy", sourceCard: "0..1", targetCard: "N", x: 3500, y: 90,
    sourcePoints: [[1000, 300], [1000, 90], [3500, 90]], targetPoints: [[3500, 90], [6000, 90], [6000, 300]],
  },
  { label: "defines", source: "sla-policy", target: "ticket-sla-target", sourceCard: "1", targetCard: "N", x: 6200, y: 1350 },
  {
    label: "tracks", source: "support-ticket", target: "ticket-sla-target", sourceCard: "1", targetCard: "N", x: 5200, y: 2780,
    sourcePoints: [[2700, 2220], [2700, 2780], [5200, 2780]], targetPoints: [[5200, 2780], [6300, 2780], [6300, 2220]],
  },
  { label: "contains", source: "support-ticket", target: "ticket-message", sourceCard: "1", targetCard: "N", x: 1700, y: 2780 },
  { label: "records", source: "support-ticket", target: "ticket-audit-event", sourceCard: "1", targetCard: "N", x: 2550, y: 2850 },
  { label: "has chat link", source: "support-ticket", target: "ticket-chat-link", sourceCard: "1", targetCard: "0..1", x: 3450, y: 2850, kind: "identifying" },
  { label: "categorizes", source: "help-category", target: "help-article-revision", sourceCard: "1", targetCard: "N", x: 5400, y: 4200 },
  { label: "has revisions", source: "help-article", target: "help-article-revision", sourceCard: "1", targetCard: "N", x: 3650, y: 4950, kind: "identifying" },
];

const entityById = new Map(entities.map((entity) => [entity.id, entity]));
const xmlCells = [];
const svgShapes = [];
const svgEdges = [];

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function addVertex(id, value, style, x, y, width, height) {
  xmlCells.push(
    `        <mxCell id="${id}" value="${xmlEscape(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/></mxCell>`,
  );
}

function addEdge(id, source, target, value, style, points = []) {
  const pointXml = points.length
    ? `<Array as="points">${points.map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join("")}</Array>`
    : "";
  xmlCells.push(
    `        <mxCell id="${id}" value="${xmlEscape(value)}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry">${pointXml}</mxGeometry></mxCell>`,
  );
}

function attributeValue(name, detail, type) {
  let renderedName = name;
  if (type === "pk") renderedName = `<u>${name}</u>`;
  if (type === "partial") renderedName = `<span style="border-bottom:1px dashed #111111;">${name}</span>`;
  const softLabel = type === "soft" ? " · (soft ref)" : "";
  return `${renderedName}<br><font color="#444444" style="font-size:11px">${detail}${softLabel}</font>`;
}

function attributeStyle(type) {
  const common = "ellipse;whiteSpace=wrap;html=1;strokeWidth=1.5;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=13;align=center;verticalAlign=middle;";
  if (type === "pk") return `${common}strokeColor=#111111;strokeWidth=2;`;
  if (type === "derived") return `${common}strokeColor=#111111;dashed=1;dashPattern=6 5;`;
  return `${common}strokeColor=#555555;`;
}

function ellipsePoint(entity, index) {
  const count = entity.attrs.length;
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
  const radiusX = count >= 12 ? 470 : count >= 9 ? 400 : count >= 7 ? 340 : 290;
  const radiusY = count >= 12 ? 350 : count >= 9 ? 305 : count >= 7 ? 260 : 225;
  return {
    x: Math.round(entity.x + Math.cos(angle) * radiusX),
    y: Math.round(entity.y + Math.sin(angle) * radiusY),
  };
}

const entityStyle = "rounded=0;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=2.5;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=17;fontStyle=1;align=center;verticalAlign=middle;";
const featuredEntityStyle = "rounded=0;whiteSpace=wrap;html=1;strokeColor=#000000;strokeWidth=4;fillColor=#ffffff;fontColor=#000000;fontFamily=Arial;fontSize=19;fontStyle=1;align=center;verticalAlign=middle;";
const weakEntityOuterStyle = "rounded=0;whiteSpace=wrap;html=1;strokeColor=#000000;strokeWidth=2.5;fillColor=#ffffff;fontColor=#000000;";
const weakEntityInnerStyle = "rounded=0;whiteSpace=wrap;html=1;strokeColor=#000000;strokeWidth=1.8;fillColor=#ffffff;fontColor=#000000;fontFamily=Arial;fontSize=16;fontStyle=1;align=center;verticalAlign=middle;";
const relationStyle = "rhombus;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=2;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=13;fontStyle=1;align=center;verticalAlign=middle;";
const identifyingRelationOuterStyle = "rhombus;whiteSpace=wrap;html=1;strokeColor=#000000;strokeWidth=2.2;fillColor=#ffffff;";
const identifyingRelationInnerStyle = "rhombus;whiteSpace=wrap;html=1;strokeColor=#000000;strokeWidth=1.5;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=12;fontStyle=1;align=center;verticalAlign=middle;";
const physicalEdgeStyle = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#111111;strokeWidth=1.8;fontColor=#111111;fontFamily=Arial;fontSize=15;fontStyle=1;labelBackgroundColor=#ffffff;endArrow=none;startArrow=none;";
const attributeEdgeStyle = "edgeStyle=none;html=1;strokeColor=#777777;strokeWidth=1.1;endArrow=none;startArrow=none;";

addVertex("title", "<b>Customer Service — Normalized E-R Diagram</b>", "text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontFamily=Arial;fontSize=34;fontColor=#111111;", 80, 35, 2500, 55);
addVertex("subtitle", "Chen notation · PostgreSQL OLTP · all designed columns · one continuous canvas", "text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontFamily=Arial;fontSize=17;fontColor=#444444;", 82, 90, 2200, 34);

for (const entity of entities) {
  const width = entity.featured ? 260 : 235;
  const height = entity.featured ? 88 : 76;
  if (entity.weak) {
    addVertex(entity.id, "", weakEntityOuterStyle, entity.x - width / 2, entity.y - height / 2, width, height);
    addVertex(`${entity.id}-inner`, `<b>${entity.name}</b>`, weakEntityInnerStyle, entity.x - width / 2 + 8, entity.y - height / 2 + 8, width - 16, height - 16);
  } else {
    addVertex(entity.id, `<b>${entity.name}</b>`, entity.featured ? featuredEntityStyle : entityStyle, entity.x - width / 2, entity.y - height / 2, width, height);
  }
  svgShapes.push({ type: "entity", entity, x: entity.x - width / 2, y: entity.y - height / 2, width, height });

  entity.attrs.forEach(([name, detail, type], index) => {
    const point = ellipsePoint(entity, index);
    const attrWidth = Math.max(185, Math.min(270, 95 + name.length * 7));
    const attrHeight = 66;
    const attrId = `${entity.id}-attr-${index + 1}`;
    addVertex(attrId, attributeValue(name, detail, type), attributeStyle(type), point.x - attrWidth / 2, point.y - attrHeight / 2, attrWidth, attrHeight);
    addEdge(`${attrId}-edge`, attrId, entity.id, "", attributeEdgeStyle);
    svgEdges.push({ x1: point.x, y1: point.y, x2: entity.x, y2: entity.y, kind: "attribute" });
    svgShapes.push({ type: "attribute", name, detail, attrType: type, x: point.x - attrWidth / 2, y: point.y - attrHeight / 2, width: attrWidth, height: attrHeight });
  });
}

relations.forEach((relation, index) => {
  const { label, source: sourceId, target: targetId, sourceCard: sourceCardinality, targetCard: targetCardinality, kind, x, y } = relation;
  const source = entityById.get(sourceId);
  const target = entityById.get(targetId);
  const relationId = `relation-${index + 1}`;
  if (kind === "identifying") {
    addVertex(relationId, "", identifyingRelationOuterStyle, x - 72, y - 46, 144, 92);
    addVertex(`${relationId}-inner`, label, identifyingRelationInnerStyle, x - 64, y - 38, 128, 76);
  } else {
    addVertex(relationId, label, relationStyle, x - 72, y - 46, 144, 92);
  }
  addEdge(`relation-${index + 1}-source`, sourceId, relationId, sourceCardinality, physicalEdgeStyle, relation.sourcePoints || []);
  addEdge(`relation-${index + 1}-target`, relationId, targetId, targetCardinality, physicalEdgeStyle, relation.targetPoints || []);
  svgEdges.push({ points: [[source.x, source.y], ...(relation.sourcePoints || []), [x, y]], label: sourceCardinality, kind: "relation" });
  svgEdges.push({ points: [[x, y], ...(relation.targetPoints || []), [target.x, target.y]], label: targetCardinality, kind: "relation" });
  svgShapes.push({ type: "relationship", label, identifying: kind === "identifying", x: x - 72, y: y - 46, width: 144, height: 92 });
});

// Notation legend; it is not a zone and does not partition the diagram.
addVertex("legend-title", "<b>CHEN NOTATION</b>", "text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Arial;fontSize=16;fontColor=#111111;", 5850, 4450, 230, 35);
addVertex("legend-strong", "STRONG ENTITY", entityStyle, 5850, 4500, 210, 60);
addVertex("legend-weak", "", weakEntityOuterStyle, 5850, 4590, 210, 66);
addVertex("legend-weak-inner", "WEAK ENTITY", weakEntityInnerStyle, 5858, 4598, 194, 50);
addVertex("legend-rel", "relationship", relationStyle, 6110, 4490, 140, 82);
addVertex("legend-ident", "", identifyingRelationOuterStyle, 6110, 4585, 140, 82);
addVertex("legend-ident-inner", "identifying", identifyingRelationInnerStyle, 6118, 4593, 124, 66);
addVertex("legend-pk", `<u>ticket_id</u><br><font color="#444444" style="font-size:11px">primary key</font>`, attributeStyle("pk"), 6310, 4485, 240, 72);
addVertex("legend-partial", `<span style="border-bottom:1px dashed #111111;">version</span><br><font color="#444444" style="font-size:11px">partial key</font>`, attributeStyle("partial"), 6580, 4485, 240, 72);
addVertex("legend-derived", `search_text<br><font color="#444444" style="font-size:11px">derived attribute</font>`, attributeStyle("derived"), 6310, 4585, 240, 72);
addVertex("legend-soft", `requester_id<br><font color="#444444" style="font-size:11px">(soft ref)</font>`, attributeStyle("soft"), 6580, 4585, 240, 72);
addVertex("legend-note", "No color coding · meaning is expressed by shape, line style, cardinality and labels only", "rounded=1;whiteSpace=wrap;html=1;strokeColor=#777777;fillColor=#ffffff;fontColor=#222222;fontFamily=Arial;fontSize=13;align=left;spacingLeft=12;", 5850, 4700, 970, 68);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2026-09-23T00:00:00.000Z" agent="Codex" version="24.7.17" type="device">
  <diagram id="customer-service-chen-v2" name="Customer Service ER — Complete Chen">
    <mxGraphModel dx="${WIDTH}" dy="${HEIGHT}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${WIDTH}" pageHeight="${HEIGHT}" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
${xmlCells.join("\n")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;

function svgEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`);
svg.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
svg.push(`<text x="80" y="78" font-family="Arial" font-size="42" font-weight="700" fill="#111111">Customer Service — Normalized E-R Diagram</text>`);
svg.push(`<text x="82" y="116" font-family="Arial" font-size="20" fill="#444444">Chen notation · PostgreSQL OLTP · all designed columns · one continuous canvas</text>`);

for (const edge of svgEdges) {
  const stroke = edge.kind === "attribute" ? "#888888" : "#111111";
  const width = edge.kind === "attribute" ? 1.25 : 2;
  const points = edge.points || [[edge.x1, edge.y1], [edge.x2, edge.y2]];
  svg.push(`<polyline points="${points.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`);
  if (edge.label) {
    const first = points[0];
    const second = points[1];
    const lx = Math.round(first[0] + (second[0] - first[0]) * 0.35);
    const ly = Math.round(first[1] + (second[1] - first[1]) * 0.35);
    svg.push(`<rect x="${lx - 18}" y="${ly - 18}" width="36" height="26" rx="5" fill="#ffffff"/>`);
    svg.push(`<text x="${lx}" y="${ly + 1}" text-anchor="middle" font-family="Arial" font-size="17" font-weight="700" fill="#0f172a">${svgEscape(edge.label)}</text>`);
  }
}

for (const shape of svgShapes) {
  if (shape.type === "entity") {
    const stroke = "#111111";
    const fill = "#ffffff";
    const strokeWidth = shape.entity.featured ? 5 : 3;
    svg.push(`<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
    if (shape.entity.weak) svg.push(`<rect x="${shape.x + 8}" y="${shape.y + 8}" width="${shape.width - 16}" height="${shape.height - 16}" fill="none" stroke="#111111" stroke-width="2"/>`);
    svg.push(`<text x="${shape.entity.x}" y="${shape.entity.y + 6}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#111111">${shape.entity.name}</text>`);
  } else if (shape.type === "attribute") {
    const dashed = shape.attrType === "derived" ? ' stroke-dasharray="8 6"' : "";
    svg.push(`<ellipse cx="${shape.x + shape.width / 2}" cy="${shape.y + shape.height / 2}" rx="${shape.width / 2}" ry="${shape.height / 2}" fill="#ffffff" stroke="#222222" stroke-width="${shape.attrType === "pk" ? 2.5 : 1.7}"${dashed}/>`);
    const underline = shape.attrType === "pk" ? ' text-decoration="underline"' : "";
    svg.push(`<text x="${shape.x + shape.width / 2}" y="${shape.y + 28}" text-anchor="middle" font-family="Arial" font-size="14" font-weight="600" fill="#111111"${underline}>${svgEscape(shape.name)}</text>`);
    if (shape.attrType === "partial") svg.push(`<line x1="${shape.x + shape.width * 0.3}" y1="${shape.y + 32}" x2="${shape.x + shape.width * 0.7}" y2="${shape.y + 32}" stroke="#111111" stroke-width="1.5" stroke-dasharray="6 4"/>`);
    const softText = shape.attrType === "soft" ? `${shape.detail} · (soft ref)` : shape.detail;
    svg.push(`<text x="${shape.x + shape.width / 2}" y="${shape.y + 48}" text-anchor="middle" font-family="Arial" font-size="11" fill="#444444">${svgEscape(softText)}</text>`);
  } else if (shape.type === "relationship") {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    const points = `${cx},${shape.y} ${shape.x + shape.width},${cy} ${cx},${shape.y + shape.height} ${shape.x},${cy}`;
    const stroke = "#111111";
    const fill = "#ffffff";
    svg.push(`<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`);
    if (shape.identifying) {
      const inset = 8;
      const points2 = `${cx},${shape.y + inset} ${shape.x + shape.width - inset},${cy} ${cx},${shape.y + shape.height - inset} ${shape.x + inset},${cy}`;
      svg.push(`<polygon points="${points2}" fill="none" stroke="${stroke}" stroke-width="2"/>`);
    }
    svg.push(`<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="Arial" font-size="13" font-weight="700" fill="#111111">${svgEscape(shape.label)}</text>`);
  }
}

svg.push(`</svg>`);

fs.writeFileSync(DRAWIO_PATH, xml, "utf8");
sharp(Buffer.from(svg.join("\n"))).resize({ width: 2400 }).png().toFile(PREVIEW_PATH)
  .then(() => {
    console.log(`Wrote ${DRAWIO_PATH}`);
    console.log(`Wrote ${PREVIEW_PATH}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
