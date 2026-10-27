import csv, re, zipfile, xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta
src = r'C:\Users\axlfo\AppData\Local\hermes\attachments\rincian_faktur_penjualan_dokteracmobil_260914210103 ver2.xlsx'
out = r'D:\PROJECT\DRAC-APP\accurate_export_analysis.csv'
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def colnum(ref):
    m=re.match(r'([A-Z]+)', ref); n=0
    for c in m.group(1): n=n*26+ord(c)-64
    return n-1
def val(cell):
    t=cell.attrib.get('t'); texts=[x.text or '' for x in cell.findall('.//m:t',ns)]
    if texts: return ''.join(texts)
    v=cell.find('m:v',ns); return v.text if v is not None else ''
with zipfile.ZipFile(src) as z:
    root=ET.iterparse(z.open('xl/worksheets/sheet1.xml'), events=('end',))
    pages=[]; current={}; allrows=[]
    for ev,e in root:
        if e.tag.endswith('}row'):
            row={colnum(c.attrib.get('r','A1')):val(c) for c in e.findall('m:c',ns)}
            allrows.append(row); e.clear()
headers=[]
for r in allrows:
    vals=list(r.values())
    if any(v.strip()=='Tanggal' for v in vals): headers=r; break
idx={v.strip():k for k,v in headers.items() if v and v.strip()}
rows=[r for r in allrows if r.get(idx.get('Nomor #',1),'').strip() and r.get(idx.get('Nomor #',1),'').strip() != 'Nomor #']
nums=[r.get(idx['Nomor #'],'').strip() for r in rows]
ks=[r.get(idx['Keterangan Faktur Penjualan'],'').strip() for r in rows]
summary=[('sheet','Rincian Faktur Penjualan'),('physical_rows',str(len(rows))),('unique_invoice_numbers',str(len(set(nums)))),('first_invoice',nums[0]),('last_invoice',nums[-1]),('nonblank_keterangan_rows',str(sum(bool(x) for x in ks))),('blank_keterangan_rows',str(sum(not x for x in ks))),('unique_customers',str(len(set(r.get(idx['Pelanggan'],'').strip() for r in rows))))]
with open(out,'w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['metric','value']); w.writerows(summary)
print('\n'.join(f'{a}: {b}' for a,b in summary)); print('analysis_file:',out); print('columns:',len(idx)); print('has_keterangan:', 'Keterangan Faktur Penjualan' in idx)
