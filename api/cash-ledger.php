<?php
/** Kas/bank and Buku Besar share posted journal lines as their source of truth. */
function repairLegacyCashAccountDetails(PDO $pdo): int {
    // Older installations already completed the schema bootstrap before the
    // detail-type alignment was added. Restore only blank metadata for known
    // cash/bank codes; keep account IDs, mappings, activation and journals intact.
    $codes=[];
    foreach(require __DIR__.'/coa-seed.php' as $seed)if($seed[1]==='BANK')$codes[]=$seed[0];
    $marks=implode(',',array_fill(0,count($codes),'?'));
    $find=$pdo->prepare("SELECT DISTINCT c.id FROM chart_of_accounts c
        JOIN cash_accounts a ON a.ledger_account_id COLLATE utf8mb4_unicode_ci=c.id COLLATE utf8mb4_unicode_ci
        WHERE c.code IN ($marks) AND c.account_type='Asset' AND c.normal_balance='Debit'
        AND TRIM(COALESCE(c.detail_type,''))=''");
    $find->execute($codes);
    $update=$pdo->prepare("UPDATE chart_of_accounts SET detail_type='Kas & Bank',revision=revision+1
        WHERE id=? AND account_type='Asset' AND normal_balance='Debit' AND TRIM(COALESCE(detail_type,''))=''");
    $count=0;
    foreach($find->fetchAll() as $row){$update->execute([$row['id']]);$count+=$update->rowCount();}

    // Older branch records were sometimes linked to the group account
    // (1101/PR.1101/CK.1101) instead of a detail account. Repair only mappings
    // with no journal history, so existing posted lines are never reassigned.
    $branches=$pdo->query('SELECT id,name FROM branches')->fetchAll();
    $accounts=$pdo->query('SELECT id,name,account_type,branch_id,ledger_account_id FROM cash_accounts WHERE is_active=1 ORDER BY branch_id,id')->fetchAll();
    $coas=$pdo->query('SELECT id,code,parent_id,is_active FROM chart_of_accounts')->fetchAll();
    $byCode=[];foreach($coas as $coa)$byCode[(string)$coa['code']]=$coa;
    $children=[];foreach($coas as $coa)if((string)($coa['parent_id']??'')!=='')$children[(string)$coa['parent_id']]=true;
    $journalCheck=$pdo->prepare('SELECT COUNT(*) FROM journal_lines WHERE account_id=?');
    $mappingUpdate=$pdo->prepare('UPDATE cash_accounts SET ledger_account_id=? WHERE id=? AND ledger_account_id=?');
    $usedByBranch=[];
    foreach($accounts as $account){
        $ledgerId=(string)($account['ledger_account_id']??'');
        if($ledgerId!==''&&!isset($children[$ledgerId])&&(string)($account['branch_id']??'')!=='')$usedByBranch[(string)$account['branch_id'].'|'.$ledgerId]=true;
    }
    foreach($accounts as $account){
        $ledgerId=(string)($account['ledger_account_id']??'');if($ledgerId==='')continue;
        $coa=null;foreach($coas as $candidate)if((string)$candidate['id']===$ledgerId){$coa=$candidate;break;}
        if(!$coa||!isset($children[$ledgerId]))continue;
        $journalCheck->execute([$ledgerId]);if((int)$journalCheck->fetchColumn()>0)continue;
        $branchName='';foreach($branches as $branch)if((string)$branch['id']===(string)$account['branch_id']){$branchName=strtoupper((string)$branch['name']);break;}
        $prefix=str_contains($branchName,'PERINTIS')?'PR':(str_contains($branchName,'CAKALANG')?'CK':(str_contains($branchName,'MAMUJU')?'MM':(str_contains($branchName,'HERTASNING')?'HT':'')));
        if($prefix==='')continue;
        $name=strtoupper((string)$account['name']);
        $candidates=$account['account_type']==='bank'
            ? ($prefix==='PR'?['PR.110101']:[$prefix.'.1101-02'])
            : (str_contains($name,'PETTY')||str_contains($name,'PATTY')
                ? [$prefix.'.1101-03', $prefix.'.1101-01']
                : ($prefix==='PR'?['PR.110102']:[$prefix.'.1101-01',$prefix.'.1101-03']));
        $target=null;
        foreach($candidates as $code){$candidate=$byCode[$code]??null;if(!$candidate||!(bool)$candidate['is_active']||isset($children[(string)$candidate['id']]))continue;$key=(string)$account['branch_id'].'|'.(string)$candidate['id'];if(isset($usedByBranch[$key]))continue;$target=$candidate;break;}
        if(!$target)continue;
        $mappingUpdate->execute([(string)$target['id'],(string)$account['id'],$ledgerId]);
        if($mappingUpdate->rowCount()>0){$usedByBranch[(string)$account['branch_id'].'|'.(string)$target['id']]=true;$count++;}
    }
    return $count;
}

function ensureCashAccountDetails(PDO $pdo): void {
    runVersionedApiBootstrap($pdo,'api_support_20261113_cash_account_details_v3',static function(PDO $pdo): void {
        $pdo->beginTransaction();
        try { repairLegacyCashAccountDetails($pdo);$pdo->commit(); }
        catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw $error;}
    });
}

function cashJournalScope(PDO $pdo, array $actor, string $branchId = ''): array {
    if ($branchId !== '' && $branchId !== 'ALL') {
        requireAccessibleBranch($pdo, $actor, $branchId);
        return ['j.branch_id=?', [$branchId]];
    }
    if (!empty($actor['is_owner'])) return ['1=1', []];
    $branches = getAccessibleBranchIds($pdo, $actor);
    $marks = implode(',', array_fill(0, count($branches), '?'));
    return [$branches ? "(j.branch_id IS NULL OR j.branch_id='' OR j.branch_id IN ($marks))" : "(j.branch_id IS NULL OR j.branch_id='')", $branches];
}

function cashMappingError(array $account): ?string {
    if ((string)($account['ledger_account_id'] ?? '') === '' || (string)($account['ledger_account_name'] ?? '') === '') return 'Kode perkiraan kas/bank belum dihubungkan.';
    if (($account['ledger_type'] ?? '') !== 'Asset' || ($account['ledger_detail'] ?? '') !== 'Kas & Bank'
        || ($account['ledger_normal'] ?? '') !== 'Debit' || (int)($account['ledger_children'] ?? 0) > 0) {
        return 'Pilih kode perkiraan detail dengan tipe Kas & Bank dan saldo normal Debit.';
    }
    if ((int)($account['ledger_uses'] ?? 0) > 1) return 'Kode perkiraan dipakai lebih dari satu akun kas/bank. Pisahkan kode perkiraannya.';
    return null;
}

function cashAccountHasHistory(PDO $pdo, array $account): bool {
    $stmt = $pdo->prepare("SELECT
        (SELECT COUNT(*) FROM customer_payments WHERE account_id=?) +
        (SELECT COUNT(*) FROM purchase_payments WHERE account_id=? OR bank_account=?) +
        (SELECT COUNT(*) FROM branch_deposits WHERE source_account_id=? OR destination_account_id=?) +
        (SELECT COUNT(*) FROM journal_lines WHERE account_id=?)");
    $stmt->execute([$account['id'], $account['id'], $account['id'], $account['id'], $account['id'], $account['ledger_account_id'] ?? '']);
    return (int)$stmt->fetchColumn() > 0;
}

function validateCashLedgerMapping(PDO $pdo, string $ledgerId, string $cashId = ''): void {
    if ($ledgerId === '') throw new InvalidArgumentException('Kode perkiraan kas/bank wajib dipilih.');
    // Serialize mapping changes on the COA row, including two simultaneous new accounts.
    $stmt = $pdo->prepare('SELECT id,name,account_type,detail_type,normal_balance,is_active FROM chart_of_accounts WHERE id=? FOR UPDATE');
    $stmt->execute([$ledgerId]);
    $ledger = $stmt->fetch();
    if (!$ledger || !(bool)$ledger['is_active'] || $ledger['account_type'] !== 'Asset'
        || $ledger['detail_type'] !== 'Kas & Bank' || $ledger['normal_balance'] !== 'Debit') {
        throw new InvalidArgumentException('Kode perkiraan harus aktif, bertipe Kas & Bank, dan bersaldo normal Debit.');
    }
    $children = $pdo->prepare('SELECT COUNT(*) FROM chart_of_accounts WHERE parent_id=?');
    $children->execute([$ledgerId]);
    if ((int)$children->fetchColumn() > 0) throw new InvalidArgumentException('Gunakan kode perkiraan detail, bukan akun induk.');
    $used = $pdo->prepare('SELECT id FROM cash_accounts WHERE ledger_account_id=? AND id<>? LIMIT 1 FOR UPDATE');
    $used->execute([$ledgerId, $cashId]);
    if ($used->fetchColumn()) throw new InvalidArgumentException('Kode perkiraan sudah terkait akun kas/bank lain. Gunakan kode perkiraan tersendiri.');
}

function requireCashLedgerAccount(PDO $pdo, string $cashId): string {
    $stmt = $pdo->prepare('SELECT ledger_account_id FROM cash_accounts WHERE id=? AND is_active=1 FOR UPDATE');
    $stmt->execute([$cashId]);
    $ledgerId = (string)($stmt->fetchColumn() ?: '');
    validateCashLedgerMapping($pdo, $ledgerId, $cashId);
    return $ledgerId;
}

function validatePaymentCounterAccount(PDO $pdo, string $accountId, string $type, string $cashLedgerId): void {
    $stmt=$pdo->prepare('SELECT account_type,is_active FROM chart_of_accounts WHERE id=? FOR UPDATE');
    $stmt->execute([$accountId]);$account=$stmt->fetch();
    if(!$account||!(bool)$account['is_active']||$account['account_type']!==$type||$accountId===$cashLedgerId) {
        throw new InvalidArgumentException('Kode perkiraan '.($type==='Liability'?'utang supplier':'piutang pelanggan').' tidak valid atau nonaktif. Periksa pengaturan akun.');
    }
}

function cashLedgerAccounts(PDO $pdo, array $actor, string $branchId = '', ?string $to = null): array {
    [$scope, $params] = cashJournalScope($pdo, $actor, $branchId);
    $to ??= date('Y-m-d');
    $allowed = array_fill_keys(getAccessibleBranchIds($pdo, $actor), true);
    $rows = $pdo->query("SELECT a.*,b.name branch_name,c.name ledger_account_name,c.code ledger_account_code,
        c.account_type ledger_type,c.detail_type ledger_detail,c.normal_balance ledger_normal,c.is_active ledger_active,
        (SELECT COUNT(*) FROM chart_of_accounts child WHERE child.parent_id COLLATE utf8mb4_unicode_ci=a.ledger_account_id COLLATE utf8mb4_unicode_ci) ledger_children,
        (SELECT COUNT(*) FROM cash_accounts other WHERE other.ledger_account_id COLLATE utf8mb4_unicode_ci=a.ledger_account_id COLLATE utf8mb4_unicode_ci) ledger_uses
        FROM cash_accounts a LEFT JOIN branches b ON b.id COLLATE utf8mb4_unicode_ci=a.branch_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN chart_of_accounts c ON c.id COLLATE utf8mb4_unicode_ci=a.ledger_account_id COLLATE utf8mb4_unicode_ci ORDER BY a.account_type,a.name")->fetchAll();
    $totals = $pdo->prepare("SELECT l.account_id,SUM(l.debit-l.credit) balance,SUM(l.debit) cash_received,SUM(l.credit) cash_expenses
        FROM journal_lines l JOIN journal_entries j ON j.id COLLATE utf8mb4_unicode_ci=l.journal_id COLLATE utf8mb4_unicode_ci
        WHERE j.posted=1 AND j.entry_date<=? AND $scope GROUP BY l.account_id");
    $totals->execute(array_merge([$to], $params));
    $byLedger = [];
    foreach ($totals->fetchAll() as $total) $byLedger[(string)$total['account_id']] = $total;
    // Pending deposits reserve physical cash but do not change its book balance.
    $pending = $pdo->prepare("SELECT source_account_id,branch_id,SUM(CASE WHEN status='Dikirim' THEN amount ELSE 0 END) in_transit,
        SUM(CASE WHEN status='Terverifikasi' THEN amount ELSE 0 END) deposited
        FROM branch_deposits WHERE date<=? GROUP BY source_account_id,branch_id");
    $pending->execute([$to]);
    $byCash = [];
    foreach ($pending->fetchAll() as $deposit) {
        if (!isset($allowed[(string)$deposit['branch_id']])) continue;
        if ($branchId !== '' && $branchId !== 'ALL' && $branchId !== (string)$deposit['branch_id']) continue;
        $key = (string)$deposit['source_account_id'];
        $byCash[$key]['in_transit'] = ($byCash[$key]['in_transit'] ?? 0) + (float)$deposit['in_transit'];
        $byCash[$key]['deposited'] = ($byCash[$key]['deposited'] ?? 0) + (float)$deposit['deposited'];
    }
    $result = [];
    foreach ($rows as $row) {
        $accountBranch = (string)($row['branch_id'] ?? '');
        if ($accountBranch !== '' && !isset($allowed[$accountBranch])) continue;
        if ($branchId !== '' && $branchId !== 'ALL' && $accountBranch !== '' && $accountBranch !== $branchId) continue;
        $total = $byLedger[(string)($row['ledger_account_id'] ?? '')] ?? [];
        $mappingError = cashMappingError($row);
        $balance = $mappingError ? null : round((float)($total['balance'] ?? 0), 2);
        $transit = round((float)($byCash[(string)$row['id']]['in_transit'] ?? 0), 2);
        $row['mappingError'] = $mappingError;
        $row['postingEnabled'] = !$mappingError && (bool)$row['ledger_active'] && (bool)$row['is_active'];
        $row['balance'] = $balance;
        $row['in_transit'] = $transit;
        $row['unsubmitted'] = $row['account_type'] === 'cash' && $balance !== null ? max(0, round($balance - $transit, 2)) : 0;
        $row['cash_received'] = (float)($total['cash_received'] ?? 0);
        $row['cash_expenses'] = (float)($total['cash_expenses'] ?? 0);
        $row['deposited'] = (float)($byCash[(string)$row['id']]['deposited'] ?? 0);
        $result[] = $row;
    }
    return $result;
}

function cashLedgerReport(PDO $pdo, array $actor, string $from, string $to, string $branchId = ''): array {
    [$scope, $params] = cashJournalScope($pdo, $actor, $branchId);
    $accounts = cashLedgerAccounts($pdo, $actor, $branchId, $to);
    $ledgerMap = [];
    $warnings = [];
    foreach ($accounts as $account) {
        if ($account['mappingError']) {
            $warnings[] = $account['name'] . ': ' . $account['mappingError'];
        } else {
            $ledgerMap[(string)$account['ledger_account_id']] = $account;
        }
    }
    $rows = [];
    $opening = 0.0;
    if ($ledgerMap) {
        $marks = implode(',', array_fill(0, count($ledgerMap), '?'));
        $args = array_merge(array_keys($ledgerMap), [$from], $params);
        $stmt = $pdo->prepare("SELECT COALESCE(SUM(l.debit-l.credit),0) FROM journal_lines l JOIN journal_entries j ON j.id COLLATE utf8mb4_unicode_ci=l.journal_id COLLATE utf8mb4_unicode_ci
            WHERE l.account_id IN ($marks) AND j.posted=1 AND j.entry_date<? AND $scope");
        $stmt->execute($args);
        $opening = (float)$stmt->fetchColumn();
        $stmt = $pdo->prepare("SELECT l.id,l.account_id,l.debit,l.credit,l.memo,j.id journal_id,j.entry_date,j.entry_number,j.description,j.source_type,j.branch_id
            FROM journal_lines l JOIN journal_entries j ON j.id COLLATE utf8mb4_unicode_ci=l.journal_id COLLATE utf8mb4_unicode_ci
            WHERE l.account_id IN ($marks) AND j.posted=1 AND j.entry_date BETWEEN ? AND ? AND $scope
            ORDER BY j.entry_date DESC,j.entry_number DESC,l.id");
        $stmt->execute(array_merge(array_keys($ledgerMap), [$from, $to], $params));
        foreach ($stmt->fetchAll() as $line) {
            $account = $ledgerMap[(string)$line['account_id']];
            $debit = (float)$line['debit']; $credit = (float)$line['credit'];
            $rows[] = ['id'=>$line['id'],'journalId'=>$line['journal_id'],'date'=>$line['entry_date'],'number'=>$line['entry_number'],
                'description'=>$line['description'],'memo'=>$line['memo'],'account'=>$account['name'],'accountId'=>$account['id'],
                'branchId'=>$line['branch_id'],'sourceType'=>$line['source_type'],
                'kind'=>$line['source_type']==='branch_deposit'?'Transfer':($debit >= $credit?'Masuk':'Keluar'),
                'debit'=>$debit,'credit'=>$credit];
        }
    }
    return ['rows'=>$rows,'openingBalance'=>round($opening,2),
        'closingBalance'=>round($opening + array_sum(array_column($rows,'debit')) - array_sum(array_column($rows,'credit')),2),
        'unsubmitted'=>array_sum(array_column($accounts,'unsubmitted')),'warnings'=>$warnings];
}

/** Repair only the exact two-line inversion generated by the old supplier-payment code. */
function repairSupplierPaymentJournals(PDO $pdo): int {
    $candidates = $pdo->query("SELECT j.id,p.amount,p.account_id,p.bank_account
        FROM journal_entries j JOIN journal_postings jp ON jp.journal_id COLLATE utf8mb4_unicode_ci=j.id COLLATE utf8mb4_unicode_ci AND jp.source_type='supplier_payment' AND jp.source_id COLLATE utf8mb4_unicode_ci=j.source_id COLLATE utf8mb4_unicode_ci AND jp.posting_key='PAYMENT' AND jp.status='Posted'
        JOIN purchase_payments p ON p.id COLLATE utf8mb4_unicode_ci=j.source_id COLLATE utf8mb4_unicode_ci
        WHERE j.source_type='supplier_payment' AND j.posted=1 AND j.status='Posted' ORDER BY j.id FOR UPDATE")->fetchAll();
    $lines = $pdo->prepare('SELECT l.*,c.account_type FROM journal_lines l JOIN chart_of_accounts c ON c.id COLLATE utf8mb4_unicode_ci=l.account_id COLLATE utf8mb4_unicode_ci WHERE l.journal_id=? ORDER BY l.id FOR UPDATE');
    $cash = $pdo->prepare('SELECT ledger_account_id FROM cash_accounts WHERE id=?');
    $update = $pdo->prepare('UPDATE journal_lines SET debit=?,credit=? WHERE id=?');
    $audit = $pdo->prepare("INSERT INTO cash_ledger_repair_audit(journal_id,repair_key,snapshot_json) VALUES(?, 'supplier_payment_direction_v1', ?)");
    $count = 0;
    foreach ($candidates as $candidate) {
        $lines->execute([$candidate['id']]); $before = $lines->fetchAll();
        if (count($before) !== 2 || (float)$candidate['amount'] <= 0) continue;
        $cash->execute([($candidate['account_id'] ?? '') ?: $candidate['bank_account']]);
        $cashId = (string)($cash->fetchColumn() ?: '');
        $cashLine = null; $payableLine = null;
        foreach ($before as $line) {
            if ($line['account_id'] === $cashId && $line['account_type'] === 'Asset'
                && (float)$line['debit'] === (float)$candidate['amount'] && (float)$line['credit'] === 0.0
                && $line['memo'] === 'Kas/Bank pembayaran supplier') $cashLine = $line;
            if ($line['account_type'] === 'Liability' && (float)$line['credit'] === (float)$candidate['amount'] && (float)$line['debit'] === 0.0
                && $line['memo'] === 'Pembayaran hutang supplier') $payableLine = $line;
        }
        if (!$cashLine || !$payableLine) continue;
        $after = $before;
        foreach ($after as &$line) { [$line['debit'],$line['credit']] = [$line['credit'],$line['debit']]; }
        unset($line);
        $audit->execute([$candidate['id'], json_encode(['before'=>$before,'after'=>$after], JSON_THROW_ON_ERROR)]);
        foreach ($after as $line) $update->execute([$line['debit'],$line['credit'],$line['id']]);
        $count++;
    }
    return $count;
}
