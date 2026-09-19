import json
import posixpath
import sys
import zipfile
import xml.etree.ElementTree as ET

PATH = r"C:\Users\sirad\Downloads\Test_Cases4_Final_reviewed.xlsx"
sys.stdout.reconfigure(encoding="utf-8")


def text_of(node):
    return "".join(t.text or "" for t in node.iter() if t.tag.endswith("}t"))


with zipfile.ZipFile(PATH) as zf:
    names = set(zf.namelist())
    interesting = sorted(
        n for n in names
        if "comment" in n.lower() or "person" in n.lower() or "note" in n.lower()
    )

    ns_main = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    ns_rel = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}

    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    wb_rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_targets = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in wb_rels.findall("r:Relationship", ns_rel)
    }
    sheets = {}
    for sheet in workbook.findall("m:sheets/m:sheet", ns_main):
        rid = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        target = rel_targets.get(rid, "")
        sheet_path = posixpath.normpath(posixpath.join("xl", target))
        sheets[sheet_path] = sheet.attrib["name"]

    legacy = []
    threaded = []
    persons = {}

    persons_path = "xl/persons/person.xml"
    if persons_path in names:
        root = ET.fromstring(zf.read(persons_path))
        for p in root.iter():
            if p.tag.endswith("}person"):
                persons[p.attrib.get("id")] = p.attrib.get("displayName") or p.attrib.get("userId") or "Unknown"

    for sheet_path, sheet_name in sheets.items():
        rel_path = posixpath.join(posixpath.dirname(sheet_path), "_rels", posixpath.basename(sheet_path) + ".rels")
        if rel_path not in names:
            continue
        rel_root = ET.fromstring(zf.read(rel_path))
        for rel in rel_root.findall("r:Relationship", ns_rel):
            rel_type = rel.attrib.get("Type", "")
            target = posixpath.normpath(posixpath.join(posixpath.dirname(sheet_path), rel.attrib.get("Target", "")))
            if target not in names:
                continue
            if rel_type.endswith("/comments"):
                root = ET.fromstring(zf.read(target))
                authors = [a.text or "" for a in root.findall("m:authors/m:author", ns_main)]
                for c in root.findall("m:commentList/m:comment", ns_main):
                    author_id = int(c.attrib.get("authorId", "0"))
                    legacy.append({
                        "sheet": sheet_name,
                        "cell": c.attrib.get("ref"),
                        "author": authors[author_id] if author_id < len(authors) else f"authorId:{author_id}",
                        "text": text_of(c),
                        "source_part": target,
                    })
            elif "threadedComment" in rel_type:
                root = ET.fromstring(zf.read(target))
                for c in root.iter():
                    if c.tag.endswith("}threadedComment"):
                        threaded.append({
                            "sheet": sheet_name,
                            "cell": c.attrib.get("ref"),
                            "author": persons.get(c.attrib.get("personId"), c.attrib.get("personId")),
                            "date": c.attrib.get("dT"),
                            "text": text_of(c),
                            "parentId": c.attrib.get("parentId"),
                            "source_part": target,
                        })

    print(json.dumps({
        "interesting_parts": interesting,
        "sheets": sheets,
        "legacy_comments": legacy,
        "threaded_comments": threaded,
    }, ensure_ascii=False, indent=2))
