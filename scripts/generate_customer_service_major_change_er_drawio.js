const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs");
const WIDTH = 5800;

const sharedEntities = [
  {
    id: "reason", name: "ESCALATION_REASON", kind: "new setup", x: 1150, y: 650,
    attrs: [
      ["reason_id", "PK · smallint", "pk"],
      ["code", "UK · varchar(30)", "normal"],
      ["label", "varchar(120)", "normal"],
      ["is_active", "boolean", "normal"],
    ],
    positions: [700, 1000, 1300, 1600].map((x) => [x, 270]),
  },
  {
    id: "team", name: "SUPPORT_TEAM", kind: "new master", x: 3950, y: 650,
    attrs: [
      ["team_id", "PK · uuid", "pk"],
      ["name", "varchar(120)", "normal"],
      ["is_active", "boolean", "normal"],
    ],
    positions: [3650, 3950, 4250].map((x) => [x, 270]),
  },
  {
    id: "escalation", name: "TICKET_ESCALATION", kind: "new transaction", x: 2600, y: 1850,
    attrs: [
      ["escalation_id", "PK · uuid", "pk"],
      ["ticket_id", "FK → Ticket · uuid", "normal"],
      ["reason_id", "FK → Reason · smallint", "normal"],
      ["target_team_id", "FK → Team · uuid", "normal"],
      ["requested_by_id", "soft ref · Auth", "soft"],
      ["requested_at", "timestamptz", "normal"],
      ["detail", "text · nullable", "normal"],
      ["status", "varchar(20)", "normal"],
      ["closed_at", "timestamptz · nullable", "normal"],
    ],
    positions: [1450, 1730, 2010, 2290, 2570, 2850, 3130, 3410, 3690].map((x) => [x, 2550]),
  },
  {
    id: "review", name: "ESCALATION_REVIEW", kind: "new transaction · weak", weak: true, x: 4800, y: 1850,
    attrs: [
      ["escalation_id", "PK · FK · owner key", "pk"],
      ["review_no", "PK · partial key", "partial"],
      ["reviewer_id", "soft ref · Auth", "soft"],
      ["decision", "varchar(20)", "normal"],
      ["comment", "text · nullable", "normal"],
      ["reviewed_at", "timestamptz", "normal"],
    ],
    positions: [4100, 4380, 4660, 4940, 5220, 5500].map((x) => [x, 2550]),
  },
];

const variants = [
  {
    key: "ai", title: "AI / CURRENT-CODE BASELINE", height: 3350,
    output: "customer-service-major-change-ai.drawio",
    preview: "customer-service-major-change-ai-preview.png",
    ticket: {
      id: "ticket", name: "SUPPORT_TICKETS", kind: "existing · current Prisma", x: 600, y: 1850,
      attrs: [
        ["id", "PK · String", "pk"],
        ["status", "String · current snapshot", "normal"],
        ["assignee_id", "soft ref · Auth · nullable", "soft"],
        ["escalated_at", "DateTime · nullable", "normal"],
        ["escalation_note", "String · nullable", "normal"],
      ],
      positions: [150, 430, 710, 990, 1270].map((x) => [x, 2930]),
    },
    extraEntities: [],
    extraRelations: [],
    note: "Existing Ticket keeps its current status / assignee / escalation snapshot. New escalation + review rows record repeated handoffs and supervisor decisions.",
    noteY: 2960,
  },
  {
    key: "human", title: "HUMAN / REDESIGN BASELINE", height: 4500,
    output: "customer-service-major-change-human.drawio",
    preview: "customer-service-major-change-human-preview.png",
    ticket: {
      id: "ticket", name: "SUPPORT_TICKET", kind: "existing · redesign", x: 600, y: 1850,
      attrs: [
        ["ticket_id", "PK · uuid", "pk"],
        ["current_status_id", "FK · current snapshot", "normal"],
      ],
      positions: [[330, 1390], [850, 1390]],
    },
    extraEntities: [
      {
        id: "assignment", name: "TICKET_ASSIGNMENT", kind: "existing · selected columns", x: 500, y: 3550,
        attrs: [
          ["assignment_id", "PK · uuid", "pk"],
          ["ticket_id", "FK · uuid", "normal"],
          ["assignee_id", "soft ref · Auth", "soft"],
          ["assigned_at", "timestamptz", "normal"],
        ],
        positions: [160, 420, 680, 940].map((x) => [x, 4150]),
      },
      {
        id: "status-history", name: "TICKET_STATUS_HISTORY", kind: "existing · selected columns", x: 1700, y: 3550,
        attrs: [
          ["status_history_id", "PK · uuid", "pk"],
          ["ticket_id", "FK · uuid", "normal"],
          ["from_status_id", "FK · nullable", "normal"],
          ["to_status_id", "FK · required", "normal"],
          ["created_at", "timestamptz", "normal"],
        ],
        positions: [1250, 1530, 1810, 2090, 2370].map((x) => [x, 4150]),
      },
    ],
    extraRelations: [
      { id: "assignment", label: "assigned through", from: "ticket", to: "assignment", x: 520, y: 2850 },
      { id: "status", label: "changes through", from: "ticket", to: "status-history", x: 1210, y: 2850 },
    ],
    note: "Existing assignment / status history stays the source of truth for handoff and state changes. Escalation links to them through the same Ticket; no new direct FK is assumed.",
    noteY: 3720,
  },
];

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function svgText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function build(variant) {
  const cells = [];
  const svgLines = [];
  const svgShapes = [];
  const entities = [variant.ticket, ...sharedEntities, ...variant.extraEntities];
  const byId = new Map(entities.map((entity) => [entity.id, entity]));

  function vertex(id, value, style, x, y, w, h) {
    cells.push(`        <mxCell id="${id}" value="${xmlEscape(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
  }
  function edge(id, source, target, value, style) {
    cells.push(`        <mxCell id="${id}" value="${xmlEscape(value)}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }

  const entityStyle = "rounded=0;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=2.6;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=22;fontStyle=1;align=center;verticalAlign=middle;";
  const weakOuterStyle = "rounded=0;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=2.6;fillColor=#ffffff;";
  const weakInnerStyle = "rounded=0;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=1.8;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=20;fontStyle=1;align=center;verticalAlign=middle;";
  const relationStyle = "rhombus;whiteSpace=wrap;html=1;strokeColor=#111111;strokeWidth=2.2;fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=16;fontStyle=1;align=center;verticalAlign=middle;";
  const relEdgeStyle = "edgeStyle=none;html=1;strokeColor=#111111;strokeWidth=2.2;fontColor=#111111;fontFamily=Arial;fontSize=19;fontStyle=1;labelBackgroundColor=#ffffff;endArrow=none;startArrow=none;";
  const attrEdgeStyle = "edgeStyle=none;html=1;strokeColor=#888888;strokeWidth=1.25;endArrow=none;startArrow=none;";

  vertex("title", `<b>MAJOR CHANGE — ${variant.title}</b>`,
    "text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Arial;fontSize=37;fontColor=#111111;", 100, 48, 4400, 55);
  vertex("subtitle", "Proposed escalation + supervisor review · focused Chen ER · black and white · not implemented",
    "text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Arial;fontSize=21;fontColor=#333333;", 100, 110, 4800, 40);
  svgShapes.push(`<text x="100" y="89" font-family="Arial" font-size="40" font-weight="700">MAJOR CHANGE — ${variant.title}</text>`);
  svgShapes.push('<text x="100" y="145" font-family="Arial" font-size="22">Proposed escalation + supervisor review · focused Chen ER · not implemented</text>');

  for (const entity of entities) {
    if (entity.attrs.length !== entity.positions.length) throw new Error(`Attribute layout mismatch: ${entity.id}`);
    const entityId = `entity-${entity.id}`;
    const entityWidth = entity.weak ? 340 : entity.name.length > 19 ? 340 : 300;
    const entityHeight = 88;
    const x = entity.x - entityWidth / 2;
    const y = entity.y - entityHeight / 2;
    if (entity.weak) {
      vertex(entityId, "", weakOuterStyle, x, y, entityWidth, entityHeight);
      vertex(`${entityId}-inner`, `<b>${entity.name}</b>`, weakInnerStyle, x + 8, y + 8, entityWidth - 16, entityHeight - 16);
    } else vertex(entityId, `<b>${entity.name}</b>`, entityStyle, x, y, entityWidth, entityHeight);
    const tagStyle = "text;html=1;strokeColor=none;fillColor=none;align=center;fontFamily=Arial;fontSize=16;fontColor=#444444;";
    vertex(`${entityId}-tag`, entity.kind.toUpperCase(), tagStyle, entity.x - 195, y - 43, 390, 30);
    svgShapes.push(`<text x="${entity.x}" y="${y - 17}" text-anchor="middle" font-family="Arial" font-size="17" fill="#444">${svgText(entity.kind.toUpperCase())}</text>`);
    svgShapes.push(`<rect x="${x}" y="${y}" width="${entityWidth}" height="${entityHeight}" fill="white" stroke="#111" stroke-width="3"/>`);
    if (entity.weak) svgShapes.push(`<rect x="${x + 8}" y="${y + 8}" width="${entityWidth - 16}" height="${entityHeight - 16}" fill="none" stroke="#111" stroke-width="2"/>`);
    svgShapes.push(`<text x="${entity.x}" y="${entity.y + 7}" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700">${entity.name}</text>`);

    entity.attrs.forEach(([name, detail, kind], index) => {
      const [cx, cy] = entity.positions[index];
      const attrId = `${entity.id}-attr-${index + 1}`;
      const valueName = kind === "pk" ? `<u>${name}</u>` : kind === "partial"
        ? `<span style="border-bottom:1px dashed #111111;">${name}</span>` : name;
      const style = `ellipse;whiteSpace=wrap;html=1;strokeColor=${kind === "soft" ? "#555555" : "#111111"};strokeWidth=${kind === "pk" ? "2" : "1.5"};${kind === "soft" ? "dashed=1;dashPattern=5 4;" : ""}fillColor=#ffffff;fontColor=#111111;fontFamily=Arial;fontSize=18;align=center;verticalAlign=middle;spacing=1;`;
      vertex(attrId, `${valueName}<br><font color="#333333" style="font-size:13px">${detail}</font>`, style,
        cx - 119, cy - 39, 238, 78);
      edge(`${attrId}-line`, attrId, entityId, "", attrEdgeStyle);
      svgLines.push(`<line x1="${cx}" y1="${cy}" x2="${entity.x}" y2="${entity.y}" stroke="#999" stroke-width="1.5"/>`);
      svgShapes.push(`<ellipse cx="${cx}" cy="${cy}" rx="119" ry="39" fill="white" stroke="${kind === "soft" ? "#555" : "#111"}" stroke-width="${kind === "pk" ? 2 : 1.5}" ${kind === "soft" ? 'stroke-dasharray="5 4"' : ""}/>`);
      svgShapes.push(`<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="Arial" font-size="18" ${kind === "pk" ? 'text-decoration="underline"' : ""}>${svgText(name)}</text>`);
      svgShapes.push(`<text x="${cx}" y="${cy + 17}" text-anchor="middle" font-family="Arial" font-size="12" fill="#333">${svgText(detail)}</text>`);
    });
  }

  const relations = [
    { id: "ticket-escalation", label: "has requests", from: "ticket", to: "escalation", x: 1400, y: 1850 },
    { id: "reason-escalation", label: "explains", from: "reason", to: "escalation", x: 1650, y: 1190 },
    { id: "team-escalation", label: "routes to", from: "team", to: "escalation", x: 3500, y: 1190 },
    { id: "escalation-review", label: "has reviews", from: "escalation", to: "review", x: 3900, y: 1850, identifying: true },
    ...variant.extraRelations,
  ];
  for (const relation of relations) {
    const source = byId.get(relation.from);
    const target = byId.get(relation.to);
    const relId = `relation-${relation.id}`;
    if (relation.identifying) {
      vertex(relId, "", relationStyle, relation.x - 90, relation.y - 56, 180, 112);
      vertex(`${relId}-inner`, relation.label,
        relationStyle.replace("strokeWidth=2.2", "strokeWidth=1.5").replace("fontSize=16", "fontSize=14"),
        relation.x - 82, relation.y - 48, 164, 96);
    } else vertex(relId, relation.label, relationStyle, relation.x - 90, relation.y - 56, 180, 112);
    edge(`${relId}-source`, `entity-${source.id}`, relId, "1", relEdgeStyle);
    if (relation.identifying) {
      edge(`${relId}-target-upper`, relId, `entity-${target.id}`, "0..N",
        `${relEdgeStyle}exitX=1;exitY=0.44;entryX=0;entryY=0.44;`);
      edge(`${relId}-target-lower`, relId, `entity-${target.id}`, "",
        `${relEdgeStyle}exitX=1;exitY=0.56;entryX=0;entryY=0.56;`);
    } else edge(`${relId}-target`, relId, `entity-${target.id}`, "0..N", relEdgeStyle);
    svgLines.push(`<line x1="${source.x}" y1="${source.y}" x2="${relation.x}" y2="${relation.y}" stroke="#111" stroke-width="2.5"/>`);
    if (relation.identifying) {
      svgLines.push(`<line x1="${relation.x}" y1="${relation.y - 7}" x2="${target.x}" y2="${target.y - 7}" stroke="#111" stroke-width="2"/>`);
      svgLines.push(`<line x1="${relation.x}" y1="${relation.y + 7}" x2="${target.x}" y2="${target.y + 7}" stroke="#111" stroke-width="2"/>`);
    } else svgLines.push(`<line x1="${relation.x}" y1="${relation.y}" x2="${target.x}" y2="${target.y}" stroke="#111" stroke-width="2.5"/>`);
    svgShapes.push(`<polygon points="${relation.x},${relation.y - 56} ${relation.x + 90},${relation.y} ${relation.x},${relation.y + 56} ${relation.x - 90},${relation.y}" fill="white" stroke="#111" stroke-width="2.5"/>`);
    if (relation.identifying) svgShapes.push(`<polygon points="${relation.x},${relation.y - 46} ${relation.x + 75},${relation.y} ${relation.x},${relation.y + 46} ${relation.x - 75},${relation.y}" fill="none" stroke="#111" stroke-width="1.5"/>`);
    svgShapes.push(`<text x="${relation.x}" y="${relation.y + 5}" text-anchor="middle" font-family="Arial" font-size="15" font-weight="700">${svgText(relation.label)}</text>`);
    const sx = source.x + (relation.x - source.x) * 0.72;
    const sy = source.y + (relation.y - source.y) * 0.72;
    const tx = relation.x + (target.x - relation.x) * 0.23;
    const ty = relation.y + (target.y - relation.y) * 0.23;
    svgShapes.push(`<text x="${sx}" y="${sy - 18}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700">1</text>`);
    svgShapes.push(`<text x="${tx}" y="${ty - 18}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700">0..N</text>`);
  }

  vertex("note", variant.note,
    "rounded=1;whiteSpace=wrap;html=1;strokeColor=#777777;strokeWidth=1.5;fillColor=#ffffff;fontColor=#222222;fontFamily=Arial;fontSize=19;align=left;verticalAlign=middle;spacingLeft=18;", 3700, variant.noteY, 1810, 165);
  svgShapes.push(`<rect x="3700" y="${variant.noteY}" width="1810" height="165" rx="12" fill="white" stroke="#777" stroke-width="1.5"/>`);
  const noteWords = variant.note.split(" ");
  const noteLines = [];
  let line = "";
  for (const word of noteWords) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > 53) { noteLines.push(line); line = word; } else line = next;
  }
  if (line) noteLines.push(line);
  noteLines.forEach((text, index) => svgShapes.push(`<text x="3725" y="${variant.noteY + 38 + 26 * index}" font-family="Arial" font-size="17">${svgText(text)}</text>`));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="Codex" type="device">\n  <diagram id="major-change-${variant.key}" name="Major Change — ${variant.title}">\n    <mxGraphModel dx="${WIDTH}" dy="${variant.height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1650" pageHeight="1167" pageBreaks="1" math="0" shadow="0">\n      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n${cells.join("\n")}\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n`;
  fs.writeFileSync(path.join(outDir, variant.output), xml, "utf8");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${variant.height}" viewBox="0 0 ${WIDTH} ${variant.height}"><rect width="100%" height="100%" fill="white"/>${svgLines.join("")}${svgShapes.join("")}</svg>`;
  return sharp(Buffer.from(svg)).resize({ width: 2900 }).png().toFile(path.join(outDir, variant.preview));
}

Promise.all(variants.map(build))
  .then(() => console.log("Wrote both focused Major Change draw.io diagrams and previews"))
  .catch((error) => { console.error(error); process.exitCode = 1; });
