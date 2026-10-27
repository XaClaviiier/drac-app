import csv,json,re,zipfile,xml.etree.ElementTree as ET,os
from collections import defaultdict
ACC=r'C:\Users\axlfo\AppData\Local\hermes\attachments\rincian_faktur_penjualan_dokteracmobil_260914210103 ver2.xlsx'
B=r'C:\Users\axlfo\AppData\Local\hermes\cache\browser-use\workspace\20260912_234434_4bcdb2'
OUT=r'D:\PROJECT\DRAC-APP\migration-work\04-rekonsiliasi-v2'
os.makedirs(OUT,exist_ok=True); ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def norm(s): return re.sub(r'[^0-9A-Z]','',str(s or '').upper())
def phone(s): return re.sub(r'\D','',str(s or ''))
def colnum(ref):
 m=re.match(r'([A-Z]+)',ref); n=0
 for c in m.group(1): n=n*26+ord(c)-64
 return n-1
def val(c):
 t=[x.text or '' for x in c.findall('.//m:t',ns)]
 if t:return ''.join(t)
 v=c.find('m:v',ns);return v.text if v is not None else ''
with zipfile.ZipFile(ACC) as z:
 root=ET.iterparse(z.open('xl/worksheets/sheet1.xml'),events=('end',)); allrows=[]
 for _,e in root:
  if e.tag.endswith('}row'):
   allrows.append({colnum(c.attrib.get('r','A1')):val(c) for c in e.findall('m:c',ns)});e.clear()
h=next(r for r in allrows if any(v.strip()=='Tanggal' for v in r.values())); idx={v.strip():k for k,v in h.items() if v and v.strip()}
phone_key=next((k for k in idx if k.lower().startswith('handphone')), None)
print('PHONE_KEY', repr(phone_key)); print('HEADER_KEYS', list(idx.keys()))
a={}; av={}
for r in allrows:
 n=r.get(idx.get('Nomor #',-1),'').strip()
 if not n or n=='Nomor #':continue
 name=r.get(idx.get('Pelanggan',-1),'').strip(); ph=phone(r.get(idx.get(phone_key,-1),'') )
 if ph:a.setdefault(ph,name)
 s=r.get(idx.get('Keterangan Faktur Penjualan',-1),'').strip().upper()
 for m in re.findall(r'(?<![A-Z0-9])([A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3})(?![A-Z0-9])',s):
  p=norm(m)
  if len(p)>=4 and any(x.isdigit() for x in p):av.setdefault(p,(name,s))
with open(B+'\\customers.json',encoding='utf8') as f: cr=json.load(f)
with open(B+'\\vehicles.json',encoding='utf8') as f: vr=json.load(f)
c={phone(r[1]):r[0].replace('\n',' ').strip() for r in cr if len(r)>1 and phone(r[1])}
v={norm(r[0]):{'customer':' '.join(r[4].split()),'model':' '.join(r[1:3]).replace('\n',' ').strip()} for r in vr if r and norm(r[0])}
rows=[]
for p,n in a.items():rows.append([n,c.get(p,''),p,'cocok_nomor_telpon_nama_sama' if p in c and norm(n)==norm(c[p]) else ('nomor_telpon_sama_nama_beda' if p in c else 'hanya_di_accurate')])
for fn,head,data in [('customer-compare.csv',['accurate_name','cerdik_name','phone','status'],rows),('customer-perlu-dibuat.csv',['accurate_name','phone'],[x[:1]+x[2:] for x in rows if x[3]=='hanya_di_accurate'])]:
 with open(os.path.join(OUT,fn),'w',newline='',encoding='utf-8-sig') as f:csv.writer(f).writerows([head]+data)
vm=[]
for p,(n,s) in av.items():
 if p in v: vm.append([p,n,v[p]['customer'],v[p]['model'],'terdaftar_nopol_cocok'])
 else: vm.append([p,n,'','', 'hanya_di_accurate_perlu_dibuat'])
with open(os.path.join(OUT,'vehicle-compare.csv'),'w',newline='',encoding='utf-8-sig') as f:csv.writer(f).writerows([['plate','accurate_customer','cerdik_customer','cerdik_model','status']]+vm)
print(json.dumps({'accurate_customers_by_phone':len(a),'cerdik_customers_by_phone':len(c),'phone_match':sum(x[3]!='hanya_di_accurate' for x in rows),'same_phone_name_diff':sum(x[3]=='nomor_telpon_sama_nama_beda' for x in rows),'customer_need_create':sum(x[3]=='hanya_di_accurate' for x in rows),'accurate_plate_candidates':len(av),'cerdik_vehicles':len(v),'plate_match':sum(x[4]=='terdaftar_nopol_cocok' for x in vm),'vehicle_need_create':sum(x[4]!='terdaftar_nopol_cocok' for x in vm)},ensure_ascii=False))