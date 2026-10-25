import zipfile, xml.etree.ElementTree as E, json, re, math, unicodedata, copy
from pathlib import Path
p=Path(__file__).parent
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def cells(z,sheet):
    shared=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        shared=[''.join(t.itertext()) for t in E.fromstring(z.read('xl/sharedStrings.xml'))]
    root=E.fromstring(z.read(sheet))
    result={}
    for c in root.findall('.//s:sheetData/s:row/s:c',ns):
        v=c.find('s:v',ns)
        if c.get('t')=='s': value=shared[int(v.text)] if v is not None else ''
        elif c.get('t')=='inlineStr': value=''.join(c.find('s:is',ns).itertext())
        else: value=v.text if v is not None else ''
        result[c.get('r')]=value
    return result
edit=json.loads((p/'edits.json').read_text(encoding='utf8'))
expected={f'{col}{i}':v for i,row in enumerate(edit['data'],8) for col,v in zip('CDEFG',row)}|edit['extra']
with zipfile.ZipFile(p/'authored.xlsx') as a:
    authored=cells(a,'xl/worksheets/sheet4.xml')
    assert all(authored.get(k)==v for k,v in expected.items())
with zipfile.ZipFile(p/'original.xlsx') as z:
    original=cells(z,'xl/worksheets/sheet4.xml')
    xml=z.read('xl/worksheets/sheet4.xml').decode('utf8')
    def replace(m):
        cell=m.group(0)
        addr=re.search(r'\br="([A-Z]+[0-9]+)"',cell).group(1)
        if addr not in expected:return cell
        tag=cell[:cell.index('>')+1]
        tag=re.sub(r'\s+t="[^"]*"','',tag)
        tag=tag[:-1]+' t="inlineStr">'
        text=expected[addr].replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
        return tag+'<is><t xml:space="preserve">'+text+'</t></is></c>'
    xml=re.sub(r'<c\b[^>]*?(?:/>|>.*?</c>)',replace,xml,flags=re.S)
    # Enlarge only the edited rows so all wrapped steps can be read.
    widths={'C':30,'D':27,'E':40,'F':26,'G':37,'H':24}
    heights={}
    for row in range(8,37):
        lines=1
        for col,width in widths.items():
            value=expected.get(f'{col}{row}',original.get(f'{col}{row}',''))
            count=sum(max(1,math.ceil(sum(0 if unicodedata.combining(c) else 1 for c in line)/(width*0.9))) for line in value.split('\n'))
            lines=max(lines,count)
        heights[row]=max(72,lines*13+8)
    def rowheight(m):
        tag=m.group(0); row=int(re.search(r'\br="(\d+)"',tag).group(1))
        if row not in heights:return tag
        tag=re.sub(r'\s+(ht|customHeight)="[^"]*"','',tag)
        return tag[:-1]+f' ht="{heights[row]}" customHeight="1">'
    xml=re.sub(r'<row\b[^>]*>',rowheight,xml)
    out=p/'testcases-revised.xlsx'
    with zipfile.ZipFile(out,'w') as dest:
        for info in z.infolist():dest.writestr(copy.copy(info),xml.encode('utf8') if info.filename=='xl/worksheets/sheet4.xml' else z.read(info.filename))
    with zipfile.ZipFile(out) as final:
        final_values=cells(final,'xl/worksheets/sheet4.xml')
        assert all(final_values.get(k)==v for k,v in expected.items())
        assert all(v==final_values.get(k) for k,v in original.items() if k not in expected)
        changed=[f for f in z.namelist() if z.read(f)!=final.read(f)]
        assert changed==['xl/worksheets/sheet4.xml'],changed
        before=E.fromstring(z.read(changed[0])); after=E.fromstring(final.read(changed[0]))
        for b,a in zip(before.findall('.//s:c',ns),after.findall('.//s:c',ns)):
            assert b.get('r')==a.get('r')
            assert b.get('s')==a.get('s')
        print(json.dumps({'edited_cells':len(expected),'cases':29,'changed_zip_parts':changed,'other_tabs_and_results':'unchanged','row_heights':heights},ensure_ascii=False))
