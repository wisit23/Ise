"""Append the approved storage amendment to existing ER files and export it.

Original diagram pages and original PDF archives are retained. Only the generated
operational-storage page is replaced on rerun. No application database is read.
"""
from pathlib import Path
import html
import re
import xml.etree.ElementTree as ET
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf"
PREVIEW = ROOT / "tmp" / "pdfs"
SPECS = {
    "order": {
        "folder": "Order Service", "filename": None,
        "models": ["Order", "DisputeCase", "Checkout", "Shipping", "CheckoutAddressSnapshot", "ShippingAddressSnapshot", "AttributionJob", "ProductSyncJob"],
        "relations": [
            ("DisputeCase", "order_id", "Order", "order_id", "1 : 0..1"),
            ("Order", "checkout_id", "Checkout", "checkout_id", "1 : 0..N"),
            ("Shipping", "order_id", "Order", "order_id", "1 : 0..1"),
            ("CheckoutAddressSnapshot", "checkout_id", "Checkout", "checkout_id", "1 : 0..1"),
            ("ShippingAddressSnapshot", "shipping_id", "Shipping", "shipping_id", "1 : 0..1"),
            ("AttributionJob", "order_id", "Order", "order_id", "1 : 0..1"),
            ("ProductSyncJob", "order_id", "Order", "order_id", "1 : 0..N"),
        ],
        "notes": ["Operational dispute state is stored in dispute_case, not WORKFLOW_STATE logs.", "Address tables each contain owner PK/FK plus seven typed address fields.", "Attribution and product sync are durable job tables. IDs are unchanged on retry.", "Checkout totals remain derived from order amounts; audit history is retained."],
    },
    "product": {
        "folder": "Product Service", "filename": "Product-Service-*-1.drawio",
        "models": ["AuctionRound", "AuctionItem", "ProductModerationCommand"],
        "references": [("Product", "products", "id")],
        "relations": [("AuctionItem", "round_id", "AuctionRound", "id", "1 : 0..N"), ("AuctionItem", "product_id", "Product", "id", "1 : 0..N"), ("ProductModerationCommand", "product_id", "Product", "id", "logical / historical")],
        "notes": ["Auction title/categories/cancellation fields live in auction rows, not audit JSON.", "Current moderation state remains in products (existing columns are unchanged).", "Moderation result receipts retain product IDs after deletion; no cascading FK.", "Budget is still derived from campaign attribution facts. Audit history is retained."],
    },
    "support": {
        "folder": "Customer Service", "filename": "customer-service-*-er.drawio",
        "models": ["SupportTicket", "TicketSlaRound", "TicketSlaTarget", "TicketChatMessageReceipt"],
        "references": [("SlaPolicy", "sla_policies", "sla_policy_id"), ("TicketStatusHistory", "ticket_status_history", "status_history_id, ticket_id")],
        "relations": [("TicketSlaRound", "ticket_id", "SupportTicket", "ticket_id", "1 : 0..N"), ("TicketSlaTarget", "sla_round_id,ticket_id,sla_policy_id", "TicketSlaRound", "sla_round_id,ticket_id,sla_policy_id", "1 : 0..N"), ("TicketSlaRound", "sla_policy_id", "SlaPolicy", "sla_policy_id", "1 : 0..N"), ("TicketSlaRound", "source_history_id,ticket_id", "TicketStatusHistory", "status_history_id,ticket_id", "1 : 0..1 / optional"), ("TicketChatMessageReceipt", "ticket_id", "SupportTicket", "ticket_id", "1 : 0..N")],
        "notes": ["Queue/classification/responder fields live in support_tickets, not audit events.", "SLA targets use a same-ticket/same-policy composite round FK (deferred).", "UNIQUE(ticket_id, cycle); UNIQUE(sla_round_id, metric_type); source history is unique.", "Policy snapshots keep recorded provenance. Unknown legacy values remain unknown.", "Chat receipts contain metadata only. Chat retains ownership of message bodies."],
    },
}

def parse_models(service, spec):
    source = (ROOT / f"backend/services/{service}-service/prisma/schema.prisma").read_text(encoding="utf-8")
    blocks = {m[1]: m[2] for m in re.finditer(r"^model\s+(\w+)\s*\{([\s\S]*?)^\}", source, re.M)}
    enums = set(re.findall(r"^enum\s+(\w+)", source, re.M))
    scalar = {"String", "Int", "Boolean", "DateTime", "Decimal", "Json", "Float", "BigInt", "Bytes"} | enums
    parsed = {}
    for name in spec["models"]:
        body = blocks[name]
        table = re.search(r'@@map\("([^"]+)"\)', body)[1]
        fks = set()
        for match in re.finditer(r"@relation\(fields:\s*\[([^\]]+)\]", body):
            fks.update(k.strip() for k in match[1].split(","))
        fields = []
        for line in body.splitlines():
            match = re.match(r"\s*(\w+)\s+([\w?\[\]]+)(.*)", line)
            if not match or match[2].rstrip("?[]") not in scalar:
                continue
            prop, typ, attrs = match.groups()
            sql_name = re.search(r'@map\("([^"]+)"\)', attrs)
            sql_name = sql_name[1] if sql_name else prop
            tags = []
            if re.search(r"@id\b", attrs): tags.append("PK")
            if prop in fks: tags.append("FK")
            if re.search(r"@unique\b", attrs): tags.append("UQ")
            sql_type = {"String": "TEXT", "Int": "INT", "Boolean": "BOOL", "DateTime": "TIMESTAMP(3)", "Decimal": "DECIMAL", "Json": "JSONB"}.get(typ.rstrip("?[]"), typ.rstrip("?[]"))
            db_type = re.search(r"@db\.(\w+)(?:\(([^)]+)\))?", attrs)
            if db_type: sql_type = db_type[1].upper() + (f"({db_type[2]})" if db_type[2] else "")
            if "[]" in typ: sql_type += "[]"
            nullable = "?" in typ or "[]" in typ
            if service == "product" and name == "AuctionRound" and prop == "categories": nullable = False
            fields.append((sql_name, sql_type, "NULL" if nullable else "NN", "/".join(tags)))
        parsed[name] = {"table": table, "fields": fields, "reference": False}
    for name, table, keys in spec.get("references", []):
        parsed[name] = {"table": table, "fields": [(key.strip(), "TEXT", "NN", "REF") for key in keys.split(",")], "reference": True}
    return parsed

def author(service, spec):
    models = parse_models(service, spec)
    width = 1320
    box_width = 392
    placements = {}
    y = 170
    names = list(models)
    for offset in range(0, len(names), 3):
        batch = names[offset:offset + 3]
        heights = [58 + len(models[name]["fields"]) * 23 for name in batch]
        for col, name in enumerate(batch):
            placements[name] = (34 + col * 430, y, box_width, heights[col])
        y += max(heights) + 105
    footer_y = y
    height = footer_y + len(spec["relations"]) * 66 + 70
    graph = ET.Element("mxGraphModel", {"dx": str(width), "dy": str(height), "grid": "1", "gridSize": "10", "page": "1", "pageScale": "1", "pageWidth": str(width), "pageHeight": str(height)})
    root = ET.SubElement(graph, "root")
    ET.SubElement(root, "mxCell", {"id": "0"})
    ET.SubElement(root, "mxCell", {"id": "1", "parent": "0"})
    def vertex(identifier, value, x, top, w, h, style):
        cell = ET.SubElement(root, "mxCell", {"id": identifier, "value": value, "style": style, "vertex": "1", "parent": "1"})
        ET.SubElement(cell, "mxGeometry", {"x": str(x), "y": str(top), "width": str(w), "height": str(h), "as": "geometry"})
    vertex("operational-title", f"<b>{service.title()} - approved operational storage</b><br>Current amendment to ER item 1 | audit history retained | 2026-10-14", 34, 20, 1250, 60, "text;html=1;align=left;fontSize=20;")
    vertex("operational-notes", "<br>".join(html.escape(n) for n in spec["notes"]), 34, 85, 1250, 75, "text;html=1;align=left;fontSize=13;")
    for name, model in models.items():
        x, top, w, h = placements[name]
        text = "<b>" + html.escape(model["table"]) + (" [existing reference]" if model["reference"] else "") + "</b><hr>"
        text += "<br>".join(html.escape(f"{tags or '-':7} {col} : {typ} {null}") for col, typ, null, tags in model["fields"])
        vertex("operational-" + name, text, x, top, w, h, "rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacing=12;fontFamily=Consolas;fontSize=13;fillColor=#ffffff;strokeColor=#60758a;")
    for i, (child, field, parent, key, cardinality) in enumerate(spec["relations"], 1):
        edge = ET.SubElement(root, "mxCell", {"id": f"operational-edge-{i}", "value": f"R{i}: {cardinality}", "edge": "1", "parent": "1", "source": "operational-" + child, "target": "operational-" + parent, "style": "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;startArrow=none;strokeColor=#60758a;" + ("dashed=1;" if "logical" in cardinality else "")})
        ET.SubElement(edge, "mxGeometry", {"relative": "1", "as": "geometry"})
        text = f"R{i}: {models[child]['table']}.{field} -> {models[parent]['table']}.{key} | parent:child {cardinality}"
        vertex(f"operational-relation-key-{i}", html.escape(text), 34, footer_y + (i - 1) * 66, 1250, 48, "text;html=1;align=left;fontSize=13;")
    folder = ROOT / "database/erdesign" / spec["folder"]
    diagram_folder = next(p for p in folder.iterdir() if p.is_dir() and "1" in p.name)
    diagram_path = next(p for p in diagram_folder.iterdir() if p.suffix == "" and p.is_file()) if spec["filename"] is None else next(diagram_folder.glob(spec["filename"]))
    document = ET.parse(diagram_path)
    for previous in list(document.getroot()):
        if previous.attrib.get("id") == "approved-operational-storage": document.getroot().remove(previous)
    page = ET.SubElement(document.getroot(), "diagram", {"id": "approved-operational-storage", "name": "Approved operational storage - current amendment"})
    page.append(graph)
    document.write(diagram_path, encoding="utf-8", xml_declaration=True)

    pdf_path = OUTPUT / f"{service}-operational-storage-er.pdf"
    c = canvas.Canvas(str(pdf_path), pagesize=(width, height))
    c.setTitle(f"{service.title()} - approved operational storage ER amendment")
    c.setFont("Helvetica-Bold", 23); c.setFillColor(HexColor("#152b45"))
    c.drawString(34, height - 43, f"{service.title()} - operational storage ER")
    c.setFont("Helvetica", 12); c.drawString(34, height - 67, "Current amendment to ER item 1 - 2026-10-14 - Original ER pages/PDF archives retained")
    for i, note in enumerate(spec["notes"]): c.drawString(34, height - 91 - i * 15, note)
    for name, model in models.items():
        x, top, w, h = placements[name]; bottom = height - top - h
        c.setFillColor(HexColor("#ffffff")); c.setStrokeColor(HexColor("#60758a")); c.rect(x, bottom, w, h, fill=1)
        c.setFillColor(HexColor("#e7eff7")); c.rect(x, height - top - 35, w, 35, fill=1, stroke=0)
        c.setFillColor(HexColor("#152b45")); c.setFont("Helvetica-Bold", 14)
        c.drawString(x + 12, height - top - 23, model["table"])
        c.setFont("Courier", 10.8)
        for i, (col, typ, null, tags) in enumerate(model["fields"]):
            label = f"{tags or '-':6} {col}"
            c.drawString(x + 12, height - top - 53 - i * 23, label)
            c.setFont("Courier", 9); c.drawRightString(x + w - 12, height - top - 53 - i * 23, f"{typ} {null}"); c.setFont("Courier", 10.8)
    c.setFont("Helvetica-Bold", 15); c.drawString(34, height - footer_y + 17, "Relationship keys (physical FK unless marked logical)")
    for i, (child, field, parent, key, cardinality) in enumerate(spec["relations"], 1):
        yy = height - footer_y - (i - 1) * 66
        c.setFont("Helvetica-Bold", 11); c.drawString(34, yy, f"R{i}: {models[child]['table']}  ->  {models[parent]['table']}     [parent:child {cardinality}]")
        c.setFont("Courier", 10); c.drawString(49, yy - 18, f"{field} -> {key}")
    c.setFont("Helvetica", 10); c.drawString(34, 25, "PK primary key | FK foreign key | UQ unique | NN not null | IDs to other services are logical references")
    c.save()
    doc = fitz.open(pdf_path)
    assert len(doc) == 1
    text = doc[0].get_text()
    for model in models.values():
        assert model["table"] in text
        for col, _, _, _ in model["fields"]: assert col in text, col
    doc[0].get_pixmap(matrix=fitz.Matrix(0.85, 0.85)).save(PREVIEW / f"{service}-operational-storage-er.png")
    print(f"{service}: {len(models)} entities, {sum(len(m['fields']) for m in models.values())} fields, {len(spec['relations'])} relationships; PDF and preview verified")

if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    dictionary = ["# Current operational storage amendment", "", "Approved by the user in the current thread. These definitions replace log-backed operational storage in the affected models only. Other ER pages and original PDF archives remain historical/reference material. SQL migrations preserve audit rows, IDs, timestamps, policy provenance and delivery identifiers.", "", "Source: service-owned Prisma schemas and the 20261016000000_operational_storage migrations. This is code/schema documentation, not a claim that an application database has been upgraded.", "", "Runtime compatibility keeps the existing addressSnapshot API object while storing seven typed fields in dedicated owner-keyed rows. Missing legacy classification inputs remain SQL NULL; Prisma array fields may expose SQL NULL as an empty list internally. No new classification rule is introduced."]
    for service, spec in SPECS.items():
        author(service, spec)
        dictionary.extend(["", "## " + service.title(), ""])
        for name, model in parse_models(service, spec).items():
            if model["reference"]: continue
            dictionary.extend(["### " + model["table"], "", "| Column | Type | Nullable | Key |", "| --- | --- | --- | --- |"])
            dictionary.extend(f"| `{col}` | `{typ}` | {null} | {tags or '-'} |" for col, typ, null, tags in model["fields"])
            dictionary.append("")
        dictionary.extend(["### Relationships", ""])
        models = parse_models(service, spec)
        dictionary.extend(f"- `{models[child]['table']}.{field}` -> `{models[parent]['table']}.{key}`; parent:child **{cardinality}**." for child, field, parent, key, cardinality in spec["relations"])
        dictionary.extend(["", "### Storage constraints", ""] + ["- " + note for note in spec["notes"]])
    dictionary.extend(["", "## Migration and verification", "", "Stop old writers before cutover; deploy the new runtime after the migration. New migrations do not edit old migration files or delete audit rows. Missing/conflicting snapshots, inconsistent round ownership and unrepresentable address data block migration transactionally. Local application database migration was subsequently authorized and completed; see the dated evidence for its scope and limits.", "", "See [agreements](../log/loger/operational-storage.md) and [implementation evidence](../log/evidence/operational-storage.md)."])
    (ROOT / "database/operational-storage.md").write_text("\n".join(dictionary) + "\n", encoding="utf-8")
