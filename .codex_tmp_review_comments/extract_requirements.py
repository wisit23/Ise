import sys
from pathlib import Path
from pypdf import PdfReader

sys.stdout.reconfigure(encoding="utf-8")
pdf_path = Path(r"D:\ISE Project\Ise\S2G6 DIGITAL INNOVATION AND TECHNOLOGY - Google เอกสาร.pdf")
reader = PdfReader(str(pdf_path))
print(f"PAGE_COUNT={len(reader.pages)}")
for page_no in list(range(45, 49)) + list(range(76, 80)):
    page = reader.pages[page_no - 1]
    text = page.extract_text() or ""
    print(f"\n===== PDF PAGE {page_no} =====\n{text}")
