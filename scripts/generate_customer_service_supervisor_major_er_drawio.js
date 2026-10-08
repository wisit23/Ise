const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs");
const WIDTH = 6000;
const HEIGHT = 3000;
const COLOR = {
  existing: "#EAF3FF",
  added: "#FFF0D9",
  existingStroke: "#32699A",
  addedStroke: "#AD6B16",
};

function changeColor(isAdded) {
  return isAdded
    ? { fill: COLOR.added, stroke: COLOR.addedStroke }
    : { fill: COLOR.existing, stroke: COLOR.existingStroke };
}

function addLegend(vertex, svgShapes) {
  const items = [
    { id: "existing", label: "EXISTING / ของเดิม", x: 4220, color: changeColor(false) },
    { id: "added", label: "NEW / ส่วนที่เพิ่ม", x: 5090, color: changeColor(true) },
  ];
  for (const item of items) {
    vertex(`legend-${item.id}`, item.label,
      `rounded=1;whiteSpace=wrap;html=1;strokeColor=${item.color.stroke};strokeWidth=2;fillColor=${item.color.fill};fontColor=#111111;fontFamily=Arial;fontSize=19;fontStyle=1;align=center;verticalAlign=middle;`,
      item.x, 175, 720, 44);
    svgShapes.push(`<rect x="${item.x}" y="175" width="720" height="44" rx="8" fill="${item.color.fill}" stroke="${item.color.stroke}" stroke-width="2"/>`);
    svgShapes.push(`<text x="${item.x + 360}" y="204" text-anchor="middle" font-family="Arial" font-size="19" font-weight="700">${item.label}</text>`);
  }
}

const base = [
  {
    id: "rank", name: "CS_RANK", kind: "NEW · SETUP", x: 1000, y: 700,
    attrs: [
      ["rank_id", "PK · smallint", "pk"],
      ["code", "UK · varchar(30)", "normal"],
      ["title", "varchar(100)", "normal"],
      ["level", "integer · unique", "normal"],
    ],
    positions: [550, 850, 1150, 1450].map((x) => [x, 270]),
  },
  {
    id: "staff", name: "CS_STAFF", kind: "NEW · MASTER", x: 3000, y: 700,
    attrs: [
      ["user_id", "PK · soft ref: Auth", "pksoft"],
      ["current_rank_id", "FK → CS_RANK", "normal"],
      ["is_active", "boolean", "normal"],
      ["joined_at", "timestamptz", "normal"],
      ["updated_at", "timestamptz", "normal"],
    ],
    positions: [2400, 2700, 3000, 3300, 3600].map((x) => [x, 270]),
  },
  {
    id: "rank-change", name: "CS_RANK_CHANGE", kind: "NEW · TRANSACTION", x: 5100, y: 700,
    attrs: [
      ["rank_change_id", "PK · uuid", "pk"],
      ["target_user_id", "FK → CS_STAFF", "normal"],
      ["from_rank_id", "FK → CS_RANK", "normal"],
      ["to_rank_id", "FK → CS_RANK", "normal"],
      ["changed_by_user_id", "soft ref: Auth", "soft"],
      ["reason", "text · required", "normal"],
      ["changed_at", "timestamptz", "normal"],
    ],
    positions: [4300, 4550, 4800, 5050, 5300, 5550, 5800].map((x) => [x, 270]),
  },
];

const variants = [
  {
    key: "ai", title: "AI / CURRENT-CODE BASELINE",
    diagram: "customer-service-major-change-supervisor-ai.drawio",
    preview: "customer-service-major-change-supervisor-ai-preview.png",
  },
  {
    key: "human", title: "HUMAN / REDESIGN BASELINE",
    diagram: "customer-service-major-change-supervisor-human.drawio",
    preview: "customer-service-major-change-supervisor-human-preview.png",
    ticket: {
      id: "ticket", name: "SUPPORT_TICKET", kind: "EXISTING · REDESIGN", x: 1000, y: 2000,
      attrs: [
        ["ticket_id", "PK · uuid", "pk"],
        ["current_status_id", "FK · current snapshot", "normal"],
      ],
      positions: [800, 1200].map((x) => [x, 2500]),
    },
    assignmentKind: "EXISTING · TRANSACTION",
    note: "Human baseline: reuse existing TICKET_ASSIGNMENT; assignee_id gains a proposed local CS_STAFF relationship.",
  },
];

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function render(variant) {
  const assignment = {
    id: "assignment", name: "TICKET_ASSIGNMENT", kind: variant.assignmentKind, x: 4200, y: 2000,
    attrs: [
      ["assignment_id", "PK · uuid", "pk"],
      ["ticket_id", "FK → Ticket", "normal"],
      ["assignee_id", "FK → CS_STAFF · proposed", "normal"],
      ["assigned_by_id", "soft ref: Auth", "soft"],
      ["assigned_at", "timestamptz", "normal"],
      ["ended_at", "timestamptz · nullable", "normal"],
      ["end_reason", "text · nullable", "normal"],
    ],
    positions: [3300, 3600, 3900, 4200, 4500, 4800, 5100].map((x) => [x, 2500]),
  };
  const entities = [...base, variant.ticket, assignment];
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const cells = [];
  const svgLines = [];
  const svgShapes = [];

  function vertex(id, value, style, x, y, w, h) {
    cells.push(`        <mxCell id="${id}" value="${xmlEscape(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
  }
  function edge(id, source, target, value, style) {
    cells.push(`        <mxCell id="${id}" value="${xmlEscape(value)}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }

  const entityStyle = (color) => `rounded=0;whiteSpace=wrap;html=1;strokeColor=${color.stroke};strokeWidth=2.7;fillColor=${color.fill};fontColor=#111111;fontFamily=Arial;fontSize=23;fontStyle=1;align=center;verticalAlign=middle;`;
  const relationStyle = (color) => `rhombus;whiteSpace=wrap;html=1;strokeColor=${color.stroke};strokeWidth=2.2;fillColor=${color.fill};fontColor=#111111;fontFamily=Arial;fontSize=17;fontStyle=1;align=center;verticalAlign=middle;`;
  const attrEdgeStyle = "edgeStyle=none;html=1;strokeColor=#888888;strokeWidth=1.3;endArrow=none;startArrow=none;";
  const relEdgeStyle = "edgeStyle=none;html=1;strokeColor=#111111;strokeWidth=2.4;fontColor=#111111;fontFamily=Arial;fontSize=19;fontStyle=1;labelBackgroundColor=#ffffff;endArrow=none;startArrow=none;";

  vertex("title", `<b>MAJOR CHANGE — CS SUPERVISOR — ${variant.title}</b>`,
    "text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Arial;fontSize=36;fontColor=#111111;", 100, 45, 5200, 58);
  vertex("subtitle", "Promote / demote CS staff · supervisor assigns tickets · focused Chen ER · proposed, not implemented",
    "text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Arial;fontSize=21;fontColor=#333333;", 100, 111, 5500, 41);
  svgShapes.push(`<text x="100" y="89" font-family="Arial" font-size="40" font-weight="700">MAJOR CHANGE — CS SUPERVISOR — ${variant.title}</text>`);
  svgShapes.push('<text x="100" y="147" font-family="Arial" font-size="22">Promote / demote CS staff · supervisor assigns tickets · proposed, not implemented</text>');
  addLegend(vertex, svgShapes);

  for (const entity of entities) {
    if (entity.attrs.length !== entity.positions.length) throw new Error(`Layout mismatch: ${entity.id}`);
    const w = entity.name.length > 16 ? 340 : 300;
    const h = 88;
    const id = `entity-${entity.id}`;
    const entityAdded = entity.kind.startsWith("NEW");
    const entityColor = changeColor(entityAdded);
    vertex(id, `<b>${entity.name}</b>`, entityStyle(entityColor), entity.x - w / 2, entity.y - h / 2, w, h);
    vertex(`${id}-tag`, entity.kind,
      "text;html=1;strokeColor=none;fillColor=none;align=center;fontFamily=Arial;fontSize=16;fontColor=#444444;",
      entity.x - 210, entity.y - 88, 420, 30);
    svgShapes.push(`<text x="${entity.x}" y="${entity.y - 63}" text-anchor="middle" font-family="Arial" font-size="16" fill="#444">${xmlEscape(entity.kind)}</text>`);
    svgShapes.push(`<rect x="${entity.x - w / 2}" y="${entity.y - h / 2}" width="${w}" height="${h}" fill="${entityColor.fill}" stroke="${entityColor.stroke}" stroke-width="3"/>`);
    svgShapes.push(`<text x="${entity.x}" y="${entity.y + 7}" text-anchor="middle" font-family="Arial" font-size="23" font-weight="700">${entity.name}</text>`);
    entity.attrs.forEach(([name, detail, kind], index) => {
      const [cx, cy] = entity.positions[index];
      const attrId = `${entity.id}-attr-${index + 1}`;
      const decorated = kind === "pk" || kind === "pksoft" ? `<u>${name}</u>` : name;
      const isSoft = kind === "soft" || kind === "pksoft";
      const attrColor = changeColor(entityAdded || detail.includes("proposed"));
      const style = `ellipse;whiteSpace=wrap;html=1;strokeColor=${attrColor.stroke};strokeWidth=${kind === "pk" || kind === "pksoft" ? "2.1" : "1.5"};${isSoft ? "dashed=1;dashPattern=5 4;" : ""}fillColor=${attrColor.fill};fontColor=#111111;fontFamily=Arial;fontSize=18;align=center;verticalAlign=middle;spacing=1;`;
      vertex(attrId, `${decorated}<br><font color="#333333" style="font-size:13px">${detail}</font>`, style,
        cx - 110, cy - 39, 220, 78);
      edge(`${attrId}-line`, attrId, id, "", attrEdgeStyle);
      svgLines.push(`<line x1="${cx}" y1="${cy}" x2="${entity.x}" y2="${entity.y}" stroke="#999" stroke-width="1.5"/>`);
      svgShapes.push(`<ellipse cx="${cx}" cy="${cy}" rx="110" ry="39" fill="${attrColor.fill}" stroke="${attrColor.stroke}" stroke-width="${kind === "pk" || kind === "pksoft" ? 2 : 1.5}" ${isSoft ? 'stroke-dasharray="5 4"' : ""}/>`);
      svgShapes.push(`<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="Arial" font-size="18" ${kind === "pk" || kind === "pksoft" ? 'text-decoration="underline"' : ""}>${name}</text>`);
      svgShapes.push(`<text x="${cx}" y="${cy + 17}" text-anchor="middle" font-family="Arial" font-size="12" fill="#333">${xmlEscape(detail)}</text>`);
    });
  }

  const relations = [
    { id: "rank-staff", label: "current rank", from: "rank", to: "staff", x: 2000, y: 700 },
    { id: "staff-rank-change", label: "rank changes", from: "staff", to: "rank-change", x: 4050, y: 700 },
    { id: "ticket-assignment", label: "has assignments", from: "ticket", to: "assignment", x: 2600, y: 2000 },
    { id: "staff-assignment", label: "assigned to", from: "staff", to: "assignment", x: 3300, y: 1320 },
  ];
  for (const relation of relations) {
    const from = byId.get(relation.from);
    const to = byId.get(relation.to);
    const relId = `relation-${relation.id}`;
    const relationColor = changeColor(relation.id !== "ticket-assignment");
    vertex(relId, relation.label, relationStyle(relationColor), relation.x - 100, relation.y - 58, 200, 116);
    edge(`${relId}-source`, `entity-${from.id}`, relId, "1", relEdgeStyle);
    edge(`${relId}-target`, relId, `entity-${to.id}`, "0..N", relEdgeStyle);
    svgLines.push(`<line x1="${from.x}" y1="${from.y}" x2="${relation.x}" y2="${relation.y}" stroke="#111" stroke-width="2.5"/>`);
    svgLines.push(`<line x1="${relation.x}" y1="${relation.y}" x2="${to.x}" y2="${to.y}" stroke="#111" stroke-width="2.5"/>`);
    svgShapes.push(`<polygon points="${relation.x},${relation.y - 58} ${relation.x + 100},${relation.y} ${relation.x},${relation.y + 58} ${relation.x - 100},${relation.y}" fill="${relationColor.fill}" stroke="${relationColor.stroke}" stroke-width="2.5"/>`);
    svgShapes.push(`<text x="${relation.x}" y="${relation.y + 6}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700">${relation.label}</text>`);
    const lx = from.x + 0.74 * (relation.x - from.x);
    const ly = from.y + 0.74 * (relation.y - from.y);
    const rx = relation.x + 0.27 * (to.x - relation.x);
    const ry = relation.y + 0.27 * (to.y - relation.y);
    svgShapes.push(`<text x="${lx}" y="${ly - 18}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700">1</text>`);
    svgShapes.push(`<text x="${rx}" y="${ry - 18}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700">0..N</text>`);
  }

  const noteText = `Color baseline: the earlier human ER redesign, not the deployed database. ${variant.note} CS_RANK_CHANGE.from_rank_id and to_rank_id are distinct FKs to CS_RANK; those two lines are omitted in this focused excerpt. CS rank is internal; Auth Service still owns login roles. Proposed rule: no self-promotion; a supervisor may change lower ranks, while Admin grants SUPERVISOR.`;
  vertex("note", noteText,
    "rounded=1;whiteSpace=wrap;html=1;strokeColor=#777777;strokeWidth=1.5;fillColor=#ffffff;fontColor=#222222;fontFamily=Arial;fontSize=18;align=left;verticalAlign=middle;spacingLeft=18;spacingRight=18;",
    1600, 2770, 4200, 180);
  svgShapes.push('<rect x="1600" y="2770" width="4200" height="180" rx="12" fill="white" stroke="#777" stroke-width="1.5"/>');
  const words = noteText.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > 125) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  lines.forEach((text, i) => svgShapes.push(`<text x="1630" y="${2810 + 29 * i}" font-family="Arial" font-size="18">${xmlEscape(text)}</text>`));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="Codex" type="device">\n  <diagram id="cs-supervisor-${variant.key}" name="CS Supervisor — ${variant.title}">\n    <mxGraphModel dx="${WIDTH}" dy="${HEIGHT}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1650" pageHeight="1167" pageBreaks="1" math="0" shadow="0">\n      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n${cells.join("\n")}\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n`;
  fs.writeFileSync(path.join(outDir, variant.diagram), xml, "utf8");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="100%" height="100%" fill="white"/>${svgLines.join("")}${svgShapes.join("")}</svg>`;
  return sharp(Buffer.from(svg)).resize({ width: 3000 }).png().toFile(path.join(outDir, variant.preview));
}

function renderAiCompact(variant) {
  const cells = [];
  const svgLines = [];
  const svgShapes = [];
  const staff = {
    id: "staff", name: "CS_STAFF", x: 1200, y: 1500, tag: "NEW · MASTER · CURRENT SNAPSHOT",
    attrs: [
      ["user_id", "PK · soft ref: Auth", "pksoft"],
      ["rank_code", "AGENT / SENIOR / SUPERVISOR", "normal"],
      ["is_active", "boolean", "normal"],
      ["joined_at", "timestamptz", "normal"],
      ["last_rank_changed_by_id", "soft ref: Auth", "soft"],
      ["last_rank_changed_at", "timestamptz · nullable", "normal"],
      ["last_rank_change_reason", "text · nullable", "normal"],
    ],
    positions: [450, 700, 950, 1200, 1450, 1700, 1950].map((x) => [x, 690]),
  };
  const ticket = {
    id: "ticket", name: "SUPPORT_TICKETS", x: 4200, y: 1500, tag: "EXISTING · WIDE TICKET TABLE",
    attrs: [
      ["id", "PK · String", "pk"],
      ["status", "existing · String", "normal"],
      ["category", "existing · String", "normal"],
      ["priority", "existing · String", "normal"],
      ["assignee_id", "existing · nullable", "soft"],
      ["sla_due_at", "existing · nullable", "normal"],
      ["conversation_id", "existing · soft ref: Chat", "soft"],
      ["version", "existing · Int", "normal"],
      ["assigned_by_id", "NEW · soft ref: Auth", "soft"],
      ["assigned_at", "NEW · DateTime · nullable", "normal"],
      ["assignment_note", "NEW · String · nullable", "normal"],
    ],
    positions: [2850, 3120, 3390, 3660, 3930, 4200, 4470, 4740, 5010, 5280, 5550].map((x) => [x, 2460]),
  };
  const entities = [staff, ticket];
  function vertex(id, value, style, x, y, w, h) {
    cells.push(`        <mxCell id="${id}" value="${xmlEscape(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
  }
  function edge(id, source, target, value, style) {
    cells.push(`        <mxCell id="${id}" value="${xmlEscape(value)}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }
  const entityStyle = (color) => `rounded=0;whiteSpace=wrap;html=1;strokeColor=${color.stroke};strokeWidth=2.8;fillColor=${color.fill};fontColor=#111111;fontFamily=Arial;fontSize=25;fontStyle=1;align=center;verticalAlign=middle;`;
  const relStyle = (color) => `rhombus;whiteSpace=wrap;html=1;strokeColor=${color.stroke};strokeWidth=2.3;fillColor=${color.fill};fontColor=#111111;fontFamily=Arial;fontSize=18;fontStyle=1;align=center;verticalAlign=middle;`;
  const attrEdgeStyle = "edgeStyle=none;html=1;strokeColor=#888888;strokeWidth=1.3;endArrow=none;startArrow=none;";
  const relEdgeStyle = "edgeStyle=none;html=1;strokeColor=#111111;strokeWidth=2.4;fontColor=#111111;fontFamily=Arial;fontSize=19;fontStyle=1;labelBackgroundColor=#ffffff;endArrow=none;startArrow=none;";
  vertex("title", "<b>MAJOR CHANGE — AI / WIDE-TABLE CONTINUATION</b>",
    "text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Arial;fontSize=39;fontColor=#111111;", 100, 45, 4900, 60);
  vertex("subtitle", "CS supervisor changes current rank and assigns tickets · few tables / more columns · proposed, not implemented",
    "text;html=1;strokeColor=none;fillColor=none;align=left;fontFamily=Arial;fontSize=22;fontColor=#333333;", 100, 111, 5500, 42);
  svgShapes.push('<text x="100" y="89" font-family="Arial" font-size="42" font-weight="700">MAJOR CHANGE — AI / WIDE-TABLE CONTINUATION</text>');
  svgShapes.push('<text x="100" y="147" font-family="Arial" font-size="23">CS supervisor changes current rank and assigns tickets · few tables / more columns</text>');
  addLegend(vertex, svgShapes);
  for (const entity of entities) {
    const w = entity.id === "ticket" ? 390 : 320;
    const h = 96;
    const entityId = `entity-${entity.id}`;
    const entityAdded = entity.id === "staff";
    const entityColor = changeColor(entityAdded);
    vertex(entityId, `<b>${entity.name}</b>`, entityStyle(entityColor), entity.x - w / 2, entity.y - h / 2, w, h);
    vertex(`${entityId}-tag`, entity.tag,
      "text;html=1;strokeColor=none;fillColor=none;align=center;fontFamily=Arial;fontSize=17;fontColor=#444444;",
      entity.x - 260, entity.y - 96, 520, 32);
    svgShapes.push(`<text x="${entity.x}" y="${entity.y - 70}" text-anchor="middle" font-family="Arial" font-size="18" fill="#444">${entity.tag}</text>`);
    svgShapes.push(`<rect x="${entity.x - w / 2}" y="${entity.y - h / 2}" width="${w}" height="${h}" fill="${entityColor.fill}" stroke="${entityColor.stroke}" stroke-width="3"/>`);
    svgShapes.push(`<text x="${entity.x}" y="${entity.y + 9}" text-anchor="middle" font-family="Arial" font-size="26" font-weight="700">${entity.name}</text>`);
    entity.attrs.forEach(([name, detail, kind], index) => {
      const [cx, cy] = entity.positions[index];
      const id = `${entity.id}-attr-${index + 1}`;
      const isSoft = kind === "soft" || kind === "pksoft";
      const isKey = kind === "pk" || kind === "pksoft";
      const valueName = isKey ? `<u>${name}</u>` : name;
      const attrColor = changeColor(entityAdded || detail.startsWith("NEW"));
      const style = `ellipse;whiteSpace=wrap;html=1;strokeColor=${attrColor.stroke};strokeWidth=${isKey ? "2.1" : "1.5"};${isSoft ? "dashed=1;dashPattern=5 4;" : ""}fillColor=${attrColor.fill};fontColor=#111111;fontFamily=Arial;fontSize=18;align=center;verticalAlign=middle;spacing=1;`;
      vertex(id, `${valueName}<br><font color="#333333" style="font-size:13px">${detail}</font>`, style,
        cx - 115, cy - 40, 230, 80);
      edge(`${id}-line`, id, entityId, "", attrEdgeStyle);
      svgLines.push(`<line x1="${cx}" y1="${cy}" x2="${entity.x}" y2="${entity.y}" stroke="#999" stroke-width="1.5"/>`);
      svgShapes.push(`<ellipse cx="${cx}" cy="${cy}" rx="115" ry="40" fill="${attrColor.fill}" stroke="${attrColor.stroke}" stroke-width="${isKey ? 2 : 1.5}" ${isSoft ? 'stroke-dasharray="5 4"' : ""}/>`);
      svgShapes.push(`<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="Arial" font-size="18" ${isKey ? 'text-decoration="underline"' : ""}>${name}</text>`);
      svgShapes.push(`<text x="${cx}" y="${cy + 17}" text-anchor="middle" font-family="Arial" font-size="12" fill="#333">${xmlEscape(detail)}</text>`);
    });
  }
  for (const relation of [
    { id: "assignee", label: "assigned to", x: 2700, y: 1050, sourceLabel: "1", targetLabel: "0..N" },
    { id: "assigner", label: "assigned by", x: 2700, y: 1950, sourceLabel: "1", targetLabel: "0..N" },
  ]) {
    const relId = `relation-${relation.id}`;
    const relationColor = changeColor(true);
    vertex(relId, relation.label, relStyle(relationColor), relation.x - 105, relation.y - 60, 210, 120);
    edge(`${relId}-staff`, "entity-staff", relId, relation.sourceLabel, relEdgeStyle);
    edge(`${relId}-ticket`, relId, "entity-ticket", relation.targetLabel, relEdgeStyle);
    svgLines.push(`<line x1="1200" y1="1500" x2="${relation.x}" y2="${relation.y}" stroke="#111" stroke-width="2.5"/>`);
    svgLines.push(`<line x1="${relation.x}" y1="${relation.y}" x2="4200" y2="1500" stroke="#111" stroke-width="2.5"/>`);
    svgShapes.push(`<polygon points="${relation.x},${relation.y - 60} ${relation.x + 105},${relation.y} ${relation.x},${relation.y + 60} ${relation.x - 105},${relation.y}" fill="${relationColor.fill}" stroke="${relationColor.stroke}" stroke-width="2.5"/>`);
    svgShapes.push(`<text x="${relation.x}" y="${relation.y + 6}" text-anchor="middle" font-family="Arial" font-size="17" font-weight="700">${relation.label}</text>`);
    svgShapes.push(`<text x="2250" y="${relation.y === 1050 ? 1170 : 1820}" text-anchor="middle" font-family="Arial" font-size="19" font-weight="700">1</text>`);
    svgShapes.push(`<text x="3200" y="${relation.y === 1050 ? 1170 : 1820}" text-anchor="middle" font-family="Arial" font-size="19" font-weight="700">0..N</text>`);
  }
  const note = "Color baseline: current AI-written code. CS_STAFF stores only the latest rank and latest change details. SUPPORT_TICKETS retains its existing wide row and receives assigned_by_id, assigned_at and assignment_note. Reassignment overwrites the current ticket snapshot; no separate rank or assignment history is added. Auth Service still owns login roles. Proposed safety rule: no self-promotion; Admin grants SUPERVISOR.";
  vertex("note", note,
    "rounded=1;whiteSpace=wrap;html=1;strokeColor=#777777;strokeWidth=1.5;fillColor=#ffffff;fontColor=#222222;fontFamily=Arial;fontSize=18;align=left;verticalAlign=middle;spacingLeft=18;spacingRight=18;",
    350, 2770, 5300, 180);
  svgShapes.push('<rect x="350" y="2770" width="5300" height="180" rx="12" fill="white" stroke="#777" stroke-width="1.5"/>');
  const words = note.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > 125) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  lines.forEach((text, i) => svgShapes.push(`<text x="380" y="${2810 + 28 * i}" font-family="Arial" font-size="18">${xmlEscape(text)}</text>`));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="Codex" type="device">\n  <diagram id="cs-supervisor-ai-wide" name="CS Supervisor — AI wide table">\n    <mxGraphModel dx="${WIDTH}" dy="${HEIGHT}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1650" pageHeight="1167" pageBreaks="1" math="0" shadow="0">\n      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n${cells.join("\n")}\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n`;
  fs.writeFileSync(path.join(outDir, variant.diagram), xml, "utf8");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="100%" height="100%" fill="white"/>${svgLines.join("")}${svgShapes.join("")}</svg>`;
  return sharp(Buffer.from(svg)).resize({ width: 3000 }).png().toFile(path.join(outDir, variant.preview));
}

Promise.all(variants.map((variant) => variant.key === "ai" ? renderAiCompact(variant) : render(variant)))
  .then(() => console.log("Wrote CS supervisor Major Change draw.io diagrams and previews"))
  .catch((error) => { console.error(error); process.exitCode = 1; });
