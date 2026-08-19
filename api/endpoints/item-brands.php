<?php
$pdo->exec("CREATE TABLE IF NOT EXISTS item_brands (
 id VARCHAR(64) PRIMARY KEY,
 code VARCHAR(30) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL UNIQUE,
 description VARCHAR(255) NOT NULL DEFAULT '',
 is_active TINYINT(1) NOT NULL DEFAULT 1,
 sort_order INT NOT NULL DEFAULT 0,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("ALTER TABLE items ADD COLUMN IF NOT EXISTS item_brand_id VARCHAR(64) NULL AFTER brand");
$pdo->exec("CREATE TABLE IF NOT EXISTS item_vehicle_brands(item_id VARCHAR(64) NOT NULL,vehicle_brand_id VARCHAR(64) NOT NULL,sort_order INT NOT NULL DEFAULT 0,PRIMARY KEY(item_id,vehicle_brand_id),INDEX idx_ivb_brand(vehicle_brand_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("INSERT IGNORE INTO item_brands(id,code,name,sort_order)
 SELECT CONCAT('IB-',SUBSTRING(SHA1(UPPER(TRIM(brand))),1,16)),
        LEFT(UPPER(REPLACE(TRIM(brand),' ','')),30), UPPER(TRIM(brand)), 100
 FROM items WHERE TRIM(COALESCE(brand,''))<>'' GROUP BY UPPER(TRIM(brand))");
$pdo->exec("UPDATE items i JOIN item_brands b ON UPPER(TRIM(b.name))=UPPER(TRIM(i.brand))
 SET i.item_brand_id=b.id WHERE i.item_brand_id IS NULL AND TRIM(COALESCE(i.brand,''))<>''");
$pdo->exec("INSERT IGNORE INTO item_vehicle_brands(item_id,vehicle_brand_id,sort_order)
 SELECT i.id,vb.id,COALESCE(existing.next_order,0)
 FROM items i JOIN vehicle_brands vb ON UPPER(TRIM(vb.name))=UPPER(TRIM(i.brand))
 LEFT JOIN (SELECT item_id,MAX(sort_order)+1 next_order FROM item_vehicle_brands GROUP BY item_id) existing ON existing.item_id=i.id
 WHERE TRIM(COALESCE(i.brand,''))<>''");
$pdo->exec("UPDATE items i JOIN vehicle_brands matched ON UPPER(TRIM(matched.name))=UPPER(TRIM(i.brand))
 LEFT JOIN vehicle_brands current_brand ON current_brand.id=i.vehicle_brand_id
 SET i.vehicle_brand_id=matched.id,i.vehicle_brand_name=matched.name
 WHERE i.vehicle_brand_id IS NULL OR UPPER(TRIM(COALESCE(current_brand.name,'')))='UNIVERSAL'");
$pdo->exec("UPDATE items i JOIN vehicle_brands vb ON UPPER(TRIM(vb.name))=UPPER(TRIM(i.brand)) SET i.item_brand_id=NULL,i.brand='' WHERE TRIM(COALESCE(i.brand,''))<>''");
$pdo->exec("INSERT IGNORE INTO item_vehicle_brands(item_id,vehicle_brand_id,sort_order)
 SELECT i.id,vb.id,COALESCE(existing.next_order,0)
 FROM items i JOIN item_brands ib ON ib.id=i.item_brand_id
 JOIN vehicle_brands vb ON UPPER(TRIM(vb.name))=UPPER(TRIM(ib.name))
 LEFT JOIN (SELECT item_id,MAX(sort_order)+1 next_order FROM item_vehicle_brands GROUP BY item_id) existing ON existing.item_id=i.id");
$pdo->exec("UPDATE items i JOIN item_brands ib ON ib.id=i.item_brand_id
 JOIN vehicle_brands matched ON UPPER(TRIM(matched.name))=UPPER(TRIM(ib.name))
 LEFT JOIN vehicle_brands current_brand ON current_brand.id=i.vehicle_brand_id
 SET i.vehicle_brand_id=matched.id,i.vehicle_brand_name=matched.name
 WHERE i.vehicle_brand_id IS NULL OR UPPER(TRIM(COALESCE(current_brand.name,'')))='UNIVERSAL'");
$pdo->exec("UPDATE items i JOIN item_brands ib ON ib.id=i.item_brand_id JOIN vehicle_brands vb ON UPPER(TRIM(vb.name))=UPPER(TRIM(ib.name)) SET i.item_brand_id=NULL,i.brand=''");
$pdo->exec("DELETE ib FROM item_brands ib JOIN vehicle_brands vb ON UPPER(TRIM(vb.name))=UPPER(TRIM(ib.name)) LEFT JOIN items i ON i.item_brand_id=ib.id WHERE i.id IS NULL");

function rejectVehicleBrandAsItemBrand(PDO $pdo,string $name): void {
 $check=$pdo->prepare("SELECT name FROM vehicle_brands WHERE UPPER(TRIM(name))=UPPER(TRIM(?)) LIMIT 1");$check->execute([$name]);
 if($check->fetch())respondError('Merek kendaraan tidak boleh digunakan sebagai Merek Barang',422);
}

function normalizeItemBrandCodes(PDO $pdo): void {
 $rows=$pdo->query("SELECT b.id,COUNT(i.id) AS usage_count FROM item_brands b LEFT JOIN items i ON i.item_brand_id=b.id GROUP BY b.id,b.name ORDER BY usage_count DESC,b.name ASC")->fetchAll();
 if(!$rows)return;
 $pdo->beginTransaction();
 try{
  $temporary=$pdo->prepare("UPDATE item_brands SET code=? WHERE id=?");
  foreach($rows as $index=>$row)$temporary->execute(['TMP-'.str_pad((string)($index+1),4,'0',STR_PAD_LEFT),$row['id']]);
  $final=$pdo->prepare("UPDATE item_brands SET code=?,sort_order=? WHERE id=?");
  foreach($rows as $index=>$row){$order=$index+1;$final->execute([str_pad((string)$order,2,'0',STR_PAD_LEFT),$order,$row['id']]);}
  $pdo->commit();
 }catch(Throwable $e){$pdo->rollBack();throw $e;}
}

switch ($method) {
 case 'GET':
  normalizeItemBrandCodes($pdo);
  $rows=$pdo->query("SELECT b.id,b.code,b.name,b.description,b.is_active AS isActive,b.sort_order AS sortOrder,COUNT(i.id) AS usageCount FROM item_brands b LEFT JOIN items i ON i.item_brand_id=b.id GROUP BY b.id,b.code,b.name,b.description,b.is_active,b.sort_order ORDER BY usageCount DESC,b.name")->fetchAll();
  foreach($rows as &$row){$row['isActive']=(bool)$row['isActive'];$row['usageCount']=(int)$row['usageCount'];}
  respondSuccess($rows); break;
 case 'POST':
  $d=getInput(); $name=strtoupper(trim((string)($d['name']??''))); $code=strtoupper(trim((string)($d['code']??'')));
  if($name==='')respondError('Nama merek wajib diisi',422);
  if($code==='')$code='NEW-'.substr(sha1($name.microtime(true)),0,12);
  rejectVehicleBrandAsItemBrand($pdo,$name);
  $dup=$pdo->prepare("SELECT id FROM item_brands WHERE UPPER(code)=? OR UPPER(name)=? LIMIT 1");$dup->execute([$code,$name]);if($dup->fetch())respondError('Kode atau nama merek sudah digunakan',409);
  $id=(string)($d['id']??generateId());$pdo->prepare("INSERT INTO item_brands(id,code,name,description,is_active,sort_order) VALUES(?,?,?,?,?,?)")->execute([$id,$code,$name,$d['description']??'',!empty($d['isActive'])?1:0,(int)($d['sortOrder']??100)]);
  respondSuccess(['id'=>$id],'Merek barang ditambahkan'); break;
 case 'PUT':
  if(!$id)respondError('ID required',422);$d=getInput();$name=strtoupper(trim((string)($d['name']??'')));$code=strtoupper(trim((string)($d['code']??'')));
  rejectVehicleBrandAsItemBrand($pdo,$name);
  $dup=$pdo->prepare("SELECT id FROM item_brands WHERE (UPPER(code)=? OR UPPER(name)=?) AND id<>? LIMIT 1");$dup->execute([$code,$name,$id]);if($dup->fetch())respondError('Kode atau nama merek sudah digunakan',409);
  $pdo->beginTransaction();try{$pdo->prepare("UPDATE item_brands SET code=?,name=?,description=?,is_active=?,sort_order=? WHERE id=?")->execute([$code,$name,$d['description']??'',!empty($d['isActive'])?1:0,(int)($d['sortOrder']??100),$id]);$pdo->prepare("UPDATE items SET brand=? WHERE item_brand_id=?")->execute([$name,$id]);$pdo->commit();respondSuccess(null,'Merek barang diperbarui');}catch(Throwable $e){$pdo->rollBack();throw $e;} break;
 case 'DELETE':
  if(!$id)respondError('ID required',422);$used=$pdo->prepare("SELECT COUNT(*) FROM items WHERE item_brand_id=?");$used->execute([$id]);if((int)$used->fetchColumn()>0)respondError('Merek masih digunakan. Nonaktifkan agar histori tetap utuh.',409);$pdo->prepare("DELETE FROM item_brands WHERE id=?")->execute([$id]);respondSuccess(null,'Merek barang dihapus'); break;
 default: respondError('Method not allowed',405);
}
