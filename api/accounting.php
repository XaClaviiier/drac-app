<?php
// Currency is DECIMAL(15,2) at the database boundary; arithmetic is integer cents.
function journalMoney($value): int {
    if (!is_string($value) && !is_int($value) && !is_float($value)) throw new DomainException('Nominal wajib angka desimal.');
    $text=(string)$value;
    if (!preg_match('/^\d{1,13}(?:\.\d{1,2})?$/D',$text)) throw new DomainException('Nominal maksimal 13 digit dan 2 desimal; tanpa pembulatan.');
    $parts=explode('.',$text);return (int)$parts[0]*100+(int)str_pad($parts[1]??'',2,'0');
}
function journalDecimal(int $cents): string { return intdiv($cents,100).'.'.str_pad((string)($cents%100),2,'0',STR_PAD_LEFT); }

function assertInvoiceAccountingInput(array $input): void {
    foreach($input as $key=>$value){
        if(in_array($key,['total','price','payment'],true))journalMoney($value);
        if(preg_match('/tax|ppn|discount|diskon|hpp|cost/i',(string)$key) && !is_array($value) && !in_array($value,[null,'',0,'0','0.00',false],true))throw new DomainException('Pajak/diskon/HPP belum didukung oleh posting minimal. Transaksi ditolak; jangan menghapus komponen aktual.');
        if(is_array($value))assertInvoiceAccountingInput($value);
    }
}
function assertJournalSourceMutable(PDO $pdo,string $source,string $id): void {
    $q=$pdo->prepare('SELECT 1 FROM journal_entries WHERE source_type=? AND source_id=?');$q->execute([$source,$id]);
    if($q->fetchColumn())throw new DomainException('Sumber sudah dijurnal. Edit/hapus/batal ditolak; reversal belum didukung.',409);
}
function assertNoPostedAccounting(PDO $pdo): void {
    if($pdo->query('SELECT 1 FROM journal_entries LIMIT 1')->fetchColumn())throw new DomainException('Pembersihan data diblokir karena jurnal sudah ada. Gunakan prosedur koreksi akuntansi, bukan hapus massal.',409);
}

function postJournal(PDO $pdo,string $branch,string $date,string $description,array $lines,string $actor,string $sourceType='manual',?string $sourceId=null): string {
    if (!$pdo->inTransaction()) throw new DomainException('Jurnal wajib dalam transaksi sumber.');
    $parsed=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
    if (!$parsed || $parsed->format('Y-m-d')!==$date || $date>date('Y-m-d')) throw new DomainException('Tanggal jurnal tidak valid.');
    if (!$branch || !trim($description) || strlen($description)>255 || count($lines)<2 || count($lines)>100) throw new DomainException('Lengkapi cabang, keterangan dan 2–100 baris jurnal.');
    if (!in_array($sourceType,['manual','sales_invoice','customer_payment'],true) || ($sourceType==='manual' && $sourceId!==null) || ($sourceType!=='manual' && !$sourceId)) throw new DomainException('Sumber jurnal tidak valid.');
    $debit=0;$credit=0;$validated=[];
    foreach($lines as $line){
        $d=journalMoney($line['debit']??'0');$c=journalMoney($line['credit']??'0');
        if (($d>0)===($c>0)) throw new DomainException('Isi tepat satu sisi debit atau kredit per baris.');
        $q=$pdo->prepare('SELECT * FROM chart_of_accounts WHERE id=?');$q->execute([$line['accountId']??'']);$a=$q->fetch(PDO::FETCH_ASSOC);
        $q=$pdo->prepare('SELECT COUNT(*) FROM chart_of_accounts WHERE parent_id=?');$q->execute([$line['accountId']??'']);
        if (!$a || !$a['is_active'] || $q->fetchColumn()>0) throw new DomainException('Pilih akun perkiraan aktif tanpa sub-akun.');
        $debit+=$d;$credit+=$c;$validated[]=[$a,journalDecimal($d),journalDecimal($c)];
    }
    if ($debit!==$credit || $debit===0 || $debit>999999999999999) throw new DomainException('Debit dan kredit wajib seimbang dan lebih dari nol.');
    $id=bin2hex(random_bytes(16));
    $pdo->prepare('INSERT INTO journal_entries(id,branch_id,date,description,source_type,source_id,created_by) VALUES(?,?,?,?,?,?,?)')->execute([$id,$branch,$date,$description,$sourceType,$sourceId,$actor]);
    $q=$pdo->prepare('INSERT INTO journal_lines(journal_id,line_number,account_id,account_code,account_name,debit,credit) VALUES(?,?,?,?,?,?,?)');
    foreach($validated as $i=>[$a,$d,$c])$q->execute([$id,$i+1,$a['id'],$a['code'],$a['name'],$d,$c]);
    return $id;
}

function journalRow(PDO $pdo,string $table,string $id): array {
    if (!$pdo->inTransaction()) throw new DomainException('Posting wajib dalam transaksi.');
    $key=$table==='branch_account_settings'?'branch_id':'id';
    $lock=$pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':'';
    $q=$pdo->prepare("SELECT * FROM {$table} WHERE {$key}=?{$lock}");$q->execute([$id]);
    $r=$q->fetch(PDO::FETCH_ASSOC);if(!$r)throw new DomainException('Data/mapping akuntansi belum tersedia. Atur akun cabang dan kas/bank terlebih dahulu.');return $r;
}
function journalMappedAccount(PDO $pdo,string $id,string $type): string {
    $a=journalRow($pdo,'chart_of_accounts',$id);
    if($a['account_type']!==$type || !$a['is_active'])throw new DomainException('Tipe mapping akun cabang/kas-bank tidak sesuai atau nonaktif.');return $id;
}
function postInvoiceJournal(PDO $pdo,string $invoiceId,string $actor): string {
    $i=journalRow($pdo,'sales_invoices',$invoiceId);
    if(empty($i['accounting_eligible']))throw new DomainException('Faktur legacy belum direkonsiliasi. Jangan posting ulang: siapkan saldo awal piutang terverifikasi dengan akuntan; migrasi legacy belum didukung.');
    $q=$pdo->prepare('SELECT s.*,i.type,i.purchase_price FROM sales_invoice_items s LEFT JOIN items i ON i.id=s.item_id WHERE s.invoice_id=?');$q->execute([$invoiceId]);$sum=0;$count=0;
    foreach($q->fetchAll(PDO::FETCH_ASSOC) as $line){
        // No historical valuation snapshot or COGS mapping exists. Never invent zero HPP.
        if(($line['type']??'')!=='Jasa' || journalMoney($line['purchase_price']??'0')!==0)throw new DomainException('Posting otomatis saat ini hanya jasa master tanpa biaya. Barang/HPP, Group dan baris manual belum didukung; faktur dibatalkan tanpa perubahan stok.');
        $qty=(int)$line['qty'];$price=journalMoney($line['price']);
        if($qty<1 || $price>intdiv(999999999999999,$qty))throw new DomainException('Nilai baris faktur di luar batas.');
        $sum+=$qty*$price;$count++;
    }
    if(!$count || $sum!==journalMoney($i['total']))throw new DomainException('Total faktur tidak cocok dengan detail. Pajak/diskon/HPP belum didukung; posting ditolak.');
    $m=journalRow($pdo,'branch_account_settings',$i['branch_id']);
    $ar=journalMappedAccount($pdo,(string)($m['receivable_coa_id']??''),'Asset');
    $sales=journalMappedAccount($pdo,(string)($m['service_revenue_coa_id']??''),'Revenue');
    return postJournal($pdo,$i['branch_id'],$i['date'],'Faktur '.$i['invoice_number'],[['accountId'=>$ar,'debit'=>journalDecimal($sum)],['accountId'=>$sales,'credit'=>journalDecimal($sum)]],$actor,'sales_invoice',$invoiceId);
}
function postCustomerPaymentJournal(PDO $pdo,string $paymentId,string $actor): string {
    $p=journalRow($pdo,'customer_payments',$paymentId);$i=journalRow($pdo,'sales_invoices',$p['invoice_id']);
    $q=$pdo->prepare("SELECT l.account_id FROM journal_entries j JOIN journal_lines l ON l.journal_id=j.id WHERE j.source_type='sales_invoice' AND j.source_id=? AND l.debit>0");$q->execute([$i['id']]);$ar=$q->fetchColumn();
    if(!$ar || empty($i['accounting_eligible']))throw new DomainException('Faktur legacy/tanpa jurnal pengakuan: pembayaran ditolak. Rekonsiliasi saldo awal piutang bersama akuntan; migrasi legacy belum didukung.');
    if($p['branch_id']!==$i['branch_id'])throw new DomainException('Cabang pembayaran tidak sama dengan faktur.');
    $a=journalRow($pdo,'cash_accounts',(string)$p['account_id']);
    $type=$p['payment_method']==='Tunai'?'cash':($p['payment_method']==='Transfer'?'bank':'');
    if(!$type || !$a['is_active'] || $a['account_type']!==$type || (!empty($a['branch_id']) && $a['branch_id']!==$p['branch_id']))throw new DomainException('Akun penerimaan tidak sesuai metode atau cabang.');
    $bank=journalMappedAccount($pdo,(string)$a['ledger_account_id'],'Asset');
    if($bank===$ar)throw new DomainException('Akun penerimaan tidak boleh akun piutang faktur.');
    $amount=journalDecimal(journalMoney($p['amount']));
    return postJournal($pdo,$p['branch_id'],$p['date'],'Pembayaran '.$p['payment_number'],[['accountId'=>$bank,'debit'=>$amount],['accountId'=>$ar,'credit'=>$amount]],$actor,'customer_payment',$paymentId);
}
