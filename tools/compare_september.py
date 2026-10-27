import re,zipfile,xml.etree.ElementTree as ET,csv
from pathlib import Path
from collections import defaultdict
from datetime import datetime,timedelta
src=Path(r'C:\Users\axlfo\AppData\Local\hermes\attachments\rincian_faktur_penjualan_dokteracmobil_260914210103 ver2.xlsx')
out=Path(r'D:\PROJECT\DRAC-APP\perbandingan-september-2026.csv')
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def cn(ref):
 m=re.match(r'([A-Z]+)',ref); n=0
 for c in m.group(1): n=n*26+ord(c)-64
 return n-1
def val(c):
 t=[x.text or '' for x in c.findall('.//m:t',ns)]
 if t:return ''.join(t)
 v=c.find('m:v',ns); return v.text if v is not None else ''
with zipfile.ZipFile(src) as z:
 rows=[]
 for _,e in ET.iterparse(z.open('xl/worksheets/sheet1.xml'),events=('end',)):
  if e.tag.endswith('}row'):
   rows.append({cn(c.attrib.get('r','A1')):val(c) for c in e.findall('m:c',ns)}); e.clear()
h=next(r for r in rows if any(v.strip()=='Tanggal' for v in r.values()))
idx={v.strip():k for k,v in h.items() if v and v.strip()}; ni=idx['Nomor #']; di=idx['Tanggal']
groups=defaultdict(list)
all_dates=[]
for r in rows:
 num=r.get(ni,'').strip(); ds=r.get(di,'').strip()
 if not num or num=='Nomor #': continue
 try: dt=datetime(1899,12,30)+timedelta(days=float(ds))
 except: continue
 if dt.date()>=datetime(2026,9,1).date() and dt.date()<=datetime(2026,9,14).date(): groups[num].append(r)
 all_dates.append(dt.date())
def uniq(g,k): return sorted({r.get(idx[k],'').strip() for r in g if r.get(idx[k],'').strip()})
def extract_plate(text):
 m=re.search(r'\[?([A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3})\]?',text.upper())
 return re.sub(r'\s+','',m.group(1)) if m else ''
headers=['nomor_nota_asli','tanggal_min','tanggal_max','customer','contact','id_pelanggan','nopol_dari_keterangan','kendaraan_dari_keterangan','keterangan','pekerjaan_item','total_nota','jumlah_baris_detail','status_perbandingan']
rowsout=[]
for num,g in sorted(groups.items()):
 ks=uniq(g,'Keterangan Faktur Penjualan'); cust=uniq(g,'Pelanggan'); phone=uniq(g,'Handphone Kontak Lainnya #1 Pelanggan Faktur Penj'); ids=uniq(g,'ID Pelanggan Pelanggan Faktur Penjualan'); totals=uniq(g,'Total'); dates=uniq(g,'Tanggal'); items=uniq(g,'Nama Barang')
 plates=sorted({extract_plate(k) for k in ks if extract_plate(k)})
 vehicles=[]
 for k in ks:
  x=re.sub(r'\[[^]]*\]','',k); x=re.sub(r'\b[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3}\b','',x,flags=re.I); vehicles.append(x.strip(' /'))
 jobs=[]
 for k in ks:
  for pat,label in [(r'G\.?\s*M(?:C|GC)','Ganti Magnet Clutch'),(r'EVP|EVAP','Ganti Evaporator'),(r'\bCC\b','Cuci AC')]:
   if re.search(pat,k,re.I) and label not in jobs: jobs.append(label)
 issues=[]
 if len(cust)>1: issues.append('customer berbeda')
 if len(phone)>1: issues.append('contact berbeda')
 if len(plates)>1: issues.append('nopol berbeda')
 if len(totals)>1: issues.append('total berbeda')
 if not ks: issues.append('keterangan kosong')
 if not plates: issues.append('nopol tidak terbaca')
 rowsout.append([num,min(dates),max(dates),' | '.join(cust),' | '.join(phone),' | '.join(ids),' | '.join(plates),' | '.join(dict.fromkeys(vehicles)),' | '.join(ks),' | '.join(jobs),' | '.join(totals),len(g), 'Valid' if not issues else 'Perlu pemeriksaan: '+', '.join(issues)])
with out.open('w',newline='',encoding='utf-8-sig') as f: csv.writer(f).writerows([headers]+rowsout)
print('date_min_max:',min(all_dates) if all_dates else None,max(all_dates) if all_dates else None); print('output:',out); print('unique_invoices:',len(rowsout)); print('detail_rows:',sum(x[-2] for x in rowsout)); print('needs_review:',sum(x[-1]!='Valid' for x in rowsout)); print('valid:',sum(x[-1]=='Valid' for x in rowsout))
