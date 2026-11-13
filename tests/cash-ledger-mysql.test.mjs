import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';

// Run against a disposable local MySQL instance, never the configured application DB:
// $env:DRAC_CASH_TEST_MYSQL_PORT='33317'; node --test tests/cash-ledger-mysql.test.mjs
const enabled=!!process.env.DRAC_CASH_TEST_MYSQL_PORT;
const run=(name,fn)=>test(name,{skip:enabled?false:'Set DRAC_CASH_TEST_MYSQL_PORT to an isolated MySQL port'},fn);
function fixture(t){
  const db=`drac_cash_test_${process.pid}_${randomBytes(5).toString('hex')}`;
  const call=(input)=>JSON.parse(execFileSync('php',['tests/fixtures/cash-ledger-mysql.php',db,JSON.stringify(input)],{encoding:'utf8'}).replace(/^\uFEFF/,''));
  const today=call({op:'init'}).data.today;
  t.after(()=>call({op:'drop'}));
  const api=(endpoint,method='GET',payload={},extra={})=>call({endpoint,method,payload,...extra});
  const sql=(sql,params=[])=>call({op:'sql',sql,params}).data;
  const journal=(lines,extra={})=>call({op:'journal',payload:{lines,...extra}});
  const balances=()=>api('cash-accounts').data;
  const balance=(id='CASH')=>balances().find(r=>r.id===id).balance;
  const report=(extra={})=>api('cash-bank-report','GET',{}, {query:{from:today,to:today},...extra});
  return {call,api,sql,journal,balances,balance,report,today};
}
const cashForm={code:'CASH',name:'Kas Cabang Satu',accountType:'cash',branchId:'B1',ledgerAccountId:'LC',isActive:true};

run('changing branch cash defaults preserves historical payments, journals and unrelated mappings',t=>{
  const f=fixture(t);
  assert.equal(f.api('customer-payments','POST',{invoiceId:'SI',date:f.today,amount:300,paymentMethod:'Tunai',accountId:'CASH'}).success,true);
  f.sql("INSERT INTO cash_accounts(id,code,name,account_type,branch_id,ledger_account_id) VALUES('NEW','NEW','Kas Baru','cash','B1','FREE')");
  const payments=f.sql('SELECT * FROM customer_payments ORDER BY id');
  const lines=f.sql('SELECT * FROM journal_lines ORDER BY id');
  const accounts=f.sql('SELECT * FROM cash_accounts ORDER BY id');
  const updated=f.api('branch-account-settings','PUT',{cashAccountId:'NEW'},{id:'B1'});
  assert.equal(updated.success,true,JSON.stringify(updated));
  const mapping=f.api('branch-account-settings').data.find(row=>row.branchId==='B1');
  assert.equal(mapping.cashAccountId,'NEW');assert.equal(mapping.bankAccountId,'BANK');
  assert.equal(mapping.depositDestinationAccountId,'BANK');assert.equal(mapping.receivableCoaId,'AR');
  assert.deepEqual(f.sql('SELECT * FROM customer_payments ORDER BY id'),payments);
  assert.deepEqual(f.sql('SELECT * FROM journal_lines ORDER BY id'),lines);
  assert.deepEqual(f.sql('SELECT * FROM cash_accounts ORDER BY id'),accounts);
  assert.equal(f.balance('CASH'),300);assert.equal(f.balance('NEW'),0);
  assert.equal(f.api('branch-account-settings','PUT',{receivableCoaId:'AR',goodsRevenueCoaId:null},{id:'B1'}).success,true);
  assert.equal(f.api('branch-account-settings').data.find(row=>row.branchId==='B1').cashAccountId,'NEW');
  assert.equal(f.api('customer-payments','POST',{invoiceId:'SI',date:f.today,amount:100,paymentMethod:'Tunai',accountId:'NEW'}).success,true);
  assert.equal(f.balance('CASH'),300);assert.equal(f.balance('NEW'),100);
});

run('branch defaults reject cross-branch, wrong-type and invalid ledger accounts without partial writes',t=>{
  const f=fixture(t);
  f.sql("INSERT INTO cash_accounts(id,code,name,account_type,branch_id,ledger_account_id) VALUES('BAD','BAD','Kas belum sesuai','cash','B1','AR')");
  const before=f.sql('SELECT * FROM branch_account_settings ORDER BY branch_id');
  for(const payload of [{cashAccountId:'CASH2'}, {bankAccountId:'CASH'}, {cashAccountId:'BAD'}, {cashAccountId:'missing'}, {cashAccountId:null,bankAccountId:'CASH'}, {bankAccountId:['BANK']}]) {
    const result=f.api('branch-account-settings','PUT',payload,{id:'B1'});
    assert.equal(result.success,false,JSON.stringify(payload));assert.equal(result.status,422);
    assert.deepEqual(f.sql('SELECT * FROM branch_account_settings ORDER BY branch_id'),before);
  }
  f.sql("UPDATE chart_of_accounts SET is_active=0 WHERE id='LB'");
  assert.equal(f.api('branch-account-settings','PUT',{bankAccountId:'BANK'},{id:'B1'}).success,false);
  assert.deepEqual(f.sql('SELECT * FROM branch_account_settings ORDER BY branch_id'),before);
});

run('partial branch defaults preserve legacy destinations and permit explicit clearing and shared banks',t=>{
  const f=fixture(t);
  f.sql("UPDATE branch_account_settings SET deposit_destination_account_id='unresolved-old-bank',qris_account_id='legacy-qris' WHERE branch_id='B1'");
  assert.equal(f.api('branch-account-settings','PUT',{cashAccountId:null},{id:'B1'}).success,true);
  const row=f.sql("SELECT * FROM branch_account_settings WHERE branch_id='B1'")[0];
  assert.equal(row.cash_account_id,null);assert.equal(row.bank_account_id,'BANK');
  assert.equal(row.deposit_destination_account_id,'unresolved-old-bank');assert.equal(row.qris_account_id,'legacy-qris');
  assert.equal(row.receivable_coa_id,'AR');
  assert.equal(f.api('branch-account-settings','PUT',{bankAccountId:'BANK',cashAccountId:'CASH2'},{id:'B2'}).success,true);
  const second=f.api('branch-account-settings').data.find(item=>item.branchId==='B2');
  assert.equal(second.bankAccountId,'BANK');assert.equal(second.cashAccountId,'CASH2');
  assert.equal(second.receivableCoaId,null);
});

run('legacy default cash metadata is repaired after the old bootstrap and payments keep their original ledger',t=>{
  const f=fixture(t);
  f.sql("CREATE TABLE app_schema_migrations(migration_key VARCHAR(100) PRIMARY KEY)");
  f.sql("INSERT INTO app_schema_migrations VALUES('api_support_20260910_coa_details_v1'),('coa_accurate_alignment_v1')");
  f.sql("UPDATE chart_of_accounts SET code='PR.110102',detail_type='' WHERE id='LC'");
  f.sql("UPDATE chart_of_accounts SET code='PR.110101',detail_type=NULL WHERE id='LB'");
  f.journal([['LC',1000,0],['EQ',0,1000]],{sourceType:'opening_balance'});
  const oldLines=f.sql('SELECT * FROM journal_lines ORDER BY id');
  const oldMappings=f.sql('SELECT * FROM cash_accounts ORDER BY id');
  assert.equal(f.balances().find(a=>a.id==='CASH').postingEnabled,false);
  assert.equal(f.call({op:'cash_details_bootstrap'}).success,true);
  const cash=f.balances().find(a=>a.id==='CASH');
  assert.equal(cash.postingEnabled,true);assert.equal(cash.mappingError,null);assert.equal(cash.balance,1000);
  assert.equal(f.balances().find(a=>a.id==='BANK').postingEnabled,true);
  assert.deepEqual(f.sql('SELECT * FROM journal_lines ORDER BY id'),oldLines);
  assert.deepEqual(f.sql('SELECT * FROM cash_accounts ORDER BY id'),oldMappings);
  const metadata=f.sql("SELECT id,detail_type,revision FROM chart_of_accounts WHERE id IN ('LC','LB') ORDER BY id");
  assert.ok(metadata.every(a=>a.detail_type==='Kas & Bank'&&Number(a.revision)===1));
  f.call({op:'cash_details_bootstrap'});assert.deepEqual(f.sql("SELECT id,detail_type,revision FROM chart_of_accounts WHERE id IN ('LC','LB') ORDER BY id"),metadata);
  const paid=f.api('customer-payments','POST',{invoiceId:'SI',date:f.today,amount:100,paymentMethod:'Tunai',accountId:'CASH'});
  assert.equal(paid.success,true,JSON.stringify(paid));assert.equal(f.balance(),1100);
  assert.equal(Number(f.sql("SELECT SUM(debit-credit) amount FROM journal_lines WHERE account_id='AR'")[0].amount),-100);
});

run('legacy metadata repair preserves explicit account types, inactive accounts, custom codes and invalid mappings',t=>{
  const f=fixture(t);
  f.sql("UPDATE chart_of_accounts SET code='PR.110102',detail_type='Piutang Usaha' WHERE id='LC'");
  f.sql("UPDATE chart_of_accounts SET code='PR.110101',detail_type='',is_active=0 WHERE id='LB'");
  f.sql("UPDATE chart_of_accounts SET detail_type='' WHERE id='LC2'");
  f.call({op:'cash_details_bootstrap'});
  const rows=Object.fromEntries(f.sql('SELECT * FROM chart_of_accounts').map(a=>[a.id,a]));
  assert.equal(rows.LC.detail_type,'Piutang Usaha');assert.equal(Number(rows.LC.revision),0);
  assert.equal(rows.LB.detail_type,'Kas & Bank');assert.equal(Number(rows.LB.is_active),0);
  assert.equal(rows.LC2.detail_type,'');assert.equal(Number(rows.LC2.revision),0);
  assert.ok(f.balances().every(a=>a.postingEnabled===false));
});

run('legacy cash mappings to a parent move to unused detail accounts without touching journals',t=>{
  const f=fixture(t);
  f.sql("INSERT INTO chart_of_accounts(id,code,name,account_type,detail_type,normal_balance,parent_id) VALUES('PRROOT','PR.1101','PERINTIS CASH & BANK','Asset','Kas & Bank','Debit','ROOT'),('PRBANK','PR.110101','PERINTIS BANK','Asset','Kas & Bank','Debit','PRROOT'),('PRCASH','PR.110102','PERINTIS KAS KECIL','Asset','Kas & Bank','Debit','PRROOT')");
  f.sql("UPDATE cash_accounts SET branch_id='B1',ledger_account_id='PRROOT' WHERE id='CASH'");
  f.sql("UPDATE branches SET name='PERINTIS' WHERE id='B1'");
  f.call({op:'cash_details_bootstrap'});
  const mapped=f.sql("SELECT ledger_account_id FROM cash_accounts WHERE id='CASH'")[0].ledger_account_id;
  assert.equal(mapped,'PRCASH');assert.equal(f.balances().find(a=>a.id==='CASH').mappingError,null);
  assert.equal(f.sql("SELECT COUNT(*) n FROM journal_lines WHERE account_id='PRROOT'")[0].n,0);
});

run('customer create, edit, delete update cash, receivable and invoice together',t=>{
  const f=fixture(t),payload={invoiceId:'SI',date:f.today,amount:300,paymentMethod:'Tunai',accountId:'CASH'};
  const created=f.api('customer-payments','POST',payload);assert.equal(created.success,true,JSON.stringify(created));
  assert.equal(f.balance(),300);
  assert.equal(Number(f.sql("SELECT SUM(debit-credit) amount FROM journal_lines WHERE account_id='AR'")[0].amount),-300);
  assert.equal(Number(f.sql("SELECT payment FROM sales_invoices WHERE id='SI'")[0].payment),300);
  const edit=f.api('customer-payments','PUT',{...payload,amount:200,reason:'Koreksi nominal'},{id:created.data.id});assert.equal(edit.success,true,JSON.stringify(edit));
  assert.equal(f.balance(),200);
  assert.equal(f.api('customer-payments','DELETE',{reason:'Pembayaran dibatalkan'},{id:created.data.id}).success,true);
  assert.equal(f.balance(),0);assert.equal(f.sql('SELECT * FROM journal_lines').length,0);
  assert.equal(Number(f.sql("SELECT payment FROM sales_invoices WHERE id='SI'")[0].payment),0);
});

run('supplier payment decreases cash and payable; deletion restores both',t=>{
  const f=fixture(t);f.journal([['LC',1000,0],['AP',0,1000]]);
  const payload={date:f.today,amount:200,paymentMethod:'Kas',bankAccount:'CASH'};
  const paid=f.api('purchase-invoices','POST',payload,{id:'PI',action:'payments'});assert.equal(paid.success,true,JSON.stringify(paid));
  assert.equal(f.balance(),800);
  assert.equal(Number(f.sql("SELECT SUM(credit-debit) amount FROM journal_lines WHERE account_id='AP'")[0].amount),800);
  const rows=f.report().data.rows;assert.ok(rows.some(r=>r.sourceType==='supplier_payment'&&r.credit===200&&r.debit===0));
  assert.equal(f.api('purchase-invoices','DELETE',{paymentId:paid.data.id},{id:'PI',action:'payments'}).success,true);
  assert.equal(f.balance(),1000);assert.equal(Number(f.sql("SELECT paid_amount FROM purchase_invoices WHERE id='PI'")[0].paid_amount),0);
});

run('opening balance and manual journals reconcile account, report and general ledger; pending deposits reserve cash once',t=>{
  const f=fixture(t),yesterday=new Date(`${f.today}T00:00:00Z`);yesterday.setUTCDate(yesterday.getUTCDate()-1);
  const date=yesterday.toISOString().slice(0,10);
  const opening=f.api('opening-balances','POST',{date,branchId:'B1',lines:[{accountId:'LC',debit:1000,credit:0},{accountId:'EQ',debit:0,credit:1000}]});assert.equal(opening.success,true,JSON.stringify(opening));
  const manual=f.api('general-ledger','POST',{date:f.today,description:'Biaya manual',branchId:'B1',lines:[{accountId:'EXP',debit:100,credit:0},{accountId:'LC',debit:0,credit:100}]});assert.equal(manual.success,true,JSON.stringify(manual));
  f.journal([['LC',999,0],['EQ',0,999]],{posted:0,status:'Draft'});
  f.journal([['LC',777,0],['EQ',0,777]],{date:'2099-01-01'});
  f.sql("INSERT INTO goods_receipts VALUES('GR','Supplier',25000)");
  assert.equal(f.balance(),900);
  let r=f.report().data;assert.equal(r.openingBalance,1000);assert.equal(r.closingBalance,900);assert.equal(r.rows.length,1);
  const gl=f.api('general-ledger','GET',{}, {query:{accountId:'LC',from:f.today,to:f.today,branchId:'B1'}});assert.equal(gl.data.closingBalance,f.balance());
  const sent=f.api('branch-deposits','POST',{branchId:'B1',sourceAccountId:'CASH',destinationAccountId:'BANK',amount:200,date:f.today});assert.equal(sent.success,true,JSON.stringify(sent));
  let cash=f.balances().find(r=>r.id==='CASH');assert.equal(cash.balance,900);assert.equal(cash.inTransit,200);assert.equal(cash.unsubmitted,700);
  assert.equal(f.call({op:'summary'}).data.find(r=>r.accountId==='CASH').unsubmitted,700);
  const verified=f.api('branch-deposits','PUT',{status:'Terverifikasi'},{id:sent.data.id});assert.equal(verified.success,true,JSON.stringify(verified));
  cash=f.balances().find(r=>r.id==='CASH');assert.equal(cash.balance,700);assert.equal(cash.inTransit,0);assert.equal(cash.unsubmitted,700);assert.equal(f.balance('BANK'),200);
  r=f.report().data;assert.equal(r.closingBalance,900);assert.equal(r.rows.filter(row=>row.kind==='Transfer').length,2);
  assert.equal(f.api('branch-deposits','PUT',{status:'Terverifikasi'},{id:sent.data.id}).success,false);
});

run('rejected deposit releases reserved cash without a journal or report movement',t=>{
  const f=fixture(t);f.journal([['LC',500,0],['EQ',0,500]]);
  const sent=f.api('branch-deposits','POST',{branchId:'B1',sourceAccountId:'CASH',destinationAccountId:'BANK',amount:200,date:f.today});assert.equal(sent.success,true);
  assert.equal(f.api('branch-deposits','PUT',{status:'Ditolak'},{id:sent.data.id}).success,true);
  const cash=f.balances().find(r=>r.id==='CASH');assert.equal(cash.balance,500);assert.equal(cash.unsubmitted,500);assert.equal(cash.inTransit,0);
  assert.equal(f.report().data.rows.filter(row=>row.kind==='Transfer').length,0);
});

run('cash mappings reject missing, noncash, parent, inactive and duplicate COA; history prevents remapping or deleting',t=>{
  const f=fixture(t);
  for(const ledgerAccountId of ['', 'missing','AR','EXP','LC'])assert.equal(f.api('cash-accounts','POST',{...cashForm,code:'NEW',ledgerAccountId}).success,false,ledgerAccountId);
  f.sql("UPDATE chart_of_accounts SET is_active=0 WHERE id='FREE'");
  assert.equal(f.api('cash-accounts','POST',{...cashForm,code:'NEW',ledgerAccountId:'FREE'}).success,false);
  f.sql("UPDATE chart_of_accounts SET is_active=1 WHERE id='FREE'");
  f.sql("UPDATE chart_of_accounts SET parent_id='FREE' WHERE id='AR'");
  assert.equal(f.api('cash-accounts','POST',{...cashForm,code:'NEW',ledgerAccountId:'FREE'}).success,false);
  f.sql("UPDATE chart_of_accounts SET parent_id=NULL WHERE id='AR'");
  assert.equal(f.api('cash-accounts','POST',{...cashForm,code:'NEW',ledgerAccountId:'FREE'}).success,true);
  f.journal([['LC',100,0],['EQ',0,100]]);
  assert.equal(f.api('cash-accounts','PUT',{...cashForm,ledgerAccountId:'FREE'},{id:'CASH'}).success,false);
  assert.equal(f.api('cash-accounts','PUT',{...cashForm,branchId:'B2'},{id:'CASH'}).success,false);
  assert.equal(f.api('cash-accounts','DELETE',{}, {id:'CASH'}).success,false);
  assert.equal(f.api('cash-accounts','PUT',{...cashForm,name:'Kas berganti nama'},{id:'CASH'}).success,true);
  assert.equal(f.balance(),100);
});

run('invalid mapping rolls payment writes back and does not report a false zero balance',t=>{
  const f=fixture(t);f.sql("UPDATE cash_accounts SET ledger_account_id=NULL WHERE id='CASH'");
  const failed=f.api('customer-payments','POST',{invoiceId:'SI',date:f.today,amount:100,paymentMethod:'Tunai',accountId:'CASH'});assert.equal(failed.success,false);
  assert.equal(f.sql('SELECT * FROM customer_payments').length,0);assert.equal(f.sql('SELECT * FROM journal_entries').length,0);
  assert.equal(f.balance(),null);assert.ok(f.report().data.warnings.length);
  f.sql("UPDATE cash_accounts SET ledger_account_id='LC' WHERE id='CASH'");
  f.sql("UPDATE cash_accounts SET ledger_account_id='LC' WHERE id='CASH2'");
  assert.equal(f.balance(),null);assert.equal(f.balances().find(r=>r.id==='CASH').postingEnabled,false);
  assert.equal(f.api('purchase-invoices','POST',{date:f.today,amount:100,paymentMethod:'Kas',bankAccount:'CASH'},{id:'PI',action:'payments'}).success,false);
  assert.equal(f.sql('SELECT * FROM purchase_payments').length,0);
});

run('company bank and reports honor branch permissions, selected branch and date boundaries',t=>{
  const f=fixture(t);f.journal([['LB',100,0],['EQ',0,100]],{branchId:'B1'});f.journal([['LB',300,0],['EQ',0,300]],{branchId:'B2'});
  assert.equal(f.balance('BANK'),400);
  assert.equal(f.api('cash-accounts','GET',{}, {query:{branchId:'B1'}}).data.find(r=>r.id==='BANK').balance,100);
  assert.equal(f.api('cash-accounts','GET',{}, {restricted:true}).data.find(r=>r.id==='BANK').balance,100);
  assert.equal(f.report({restricted:true}).data.closingBalance,100);
  assert.equal(f.api('general-ledger','GET',{}, {restricted:true,query:{accountId:'LB',from:f.today,to:f.today}}).data.closingBalance,100);
  assert.equal(f.report({restricted:true,query:{from:f.today,to:f.today,branchId:'B2'}}).status,403);
  assert.equal(f.report({query:{from:'2026-02-30',to:f.today}}).status,422);
});

run('inactive accounts retain historical balances and movements but cannot accept payments',t=>{
  const f=fixture(t);f.journal([['LC',100,0],['EQ',0,100]]);
  assert.equal(f.api('cash-accounts','PUT',{...cashForm,isActive:false},{id:'CASH'}).success,true);
  assert.equal(f.balance(),100);assert.equal(f.report().data.closingBalance,100);
  assert.equal(f.balances().find(r=>r.id==='CASH').postingEnabled,false);
  assert.equal(f.api('customer-payments','POST',{invoiceId:'SI',date:f.today,amount:100,paymentMethod:'Tunai',accountId:'CASH'}).success,false);
});

run('legacy supplier repair changes only exact inverted posted entries, audits before/after and is idempotent',t=>{
  const f=fixture(t);
  for(const id of ['old','correct','custom','voided'])f.sql('INSERT INTO purchase_payments(id,invoice_id,date,amount,account_id,bank_account,branch_id) VALUES(?,?,?,?,?,?,?)',[id,'PI',f.today,200,'CASH','CASH','B1']);
  const inverted=[['LC',200,0,'Kas/Bank pembayaran supplier'],['AP',0,200,'Pembayaran hutang supplier']];
  f.journal(inverted,{id:'OLD',sourceType:'supplier_payment',sourceId:'old'});
  f.journal([['LC',0,200,'Kas/Bank pembayaran supplier'],['AP',200,0,'Pembayaran hutang supplier']],{id:'CORRECT',sourceType:'supplier_payment',sourceId:'correct'});
  f.journal([['LC',200,0,'Custom'],['AP',0,200,'Custom']],{id:'CUSTOM',sourceType:'supplier_payment',sourceId:'custom'});
  f.journal(inverted,{id:'VOID',sourceType:'supplier_payment',sourceId:'voided',posted:0,status:'Voided'});
  assert.equal(f.call({op:'repair',rollback:true}).data.repaired,1);assert.equal(f.sql('SELECT * FROM cash_ledger_repair_audit').length,0);
  assert.equal(Number(f.sql("SELECT debit FROM journal_lines WHERE journal_id='OLD' AND account_id='LC'")[0].debit),200);
  assert.equal(f.call({op:'repair'}).data.repaired,1);assert.equal(f.call({op:'repair'}).data.repaired,0);
  assert.equal(Number(f.sql("SELECT credit FROM journal_lines WHERE journal_id='OLD' AND account_id='LC'")[0].credit),200);
  assert.equal(Number(f.sql("SELECT debit FROM journal_lines WHERE journal_id='CUSTOM' AND account_id='LC'")[0].debit),200);
  const audit=f.sql('SELECT snapshot_json FROM cash_ledger_repair_audit');assert.equal(audit.length,1);
  const snapshot=JSON.parse(audit[0].snapshot_json);assert.equal(snapshot.before.length,2);assert.equal(snapshot.after.length,2);
});

run('invalid payable or receivable mappings cannot create orphaned or self-offsetting payment journals',t=>{
  const f=fixture(t);
  f.sql('INSERT INTO app_settings(id,settings_json) VALUES(1,?)',[JSON.stringify({defaultAccounts:{payableCoaId:'EXP',receivableCoaId:'LC'}})]);
  const supplier=f.api('purchase-invoices','POST',{date:f.today,amount:100,paymentMethod:'Kas',bankAccount:'CASH'},{id:'PI',action:'payments'});
  assert.equal(supplier.success,false);assert.equal(f.sql('SELECT * FROM purchase_payments').length,0);
  const customer=f.api('customer-payments','POST',{invoiceId:'SI',date:f.today,amount:100,paymentMethod:'Tunai',accountId:'CASH'});
  assert.equal(customer.success,false);assert.equal(f.sql('SELECT * FROM customer_payments').length,0);assert.equal(f.sql('SELECT * FROM journal_entries').length,0);
  f.sql('UPDATE app_settings SET settings_json=? WHERE id=1',[JSON.stringify({defaultAccounts:{receivableCoaId:'missing'}})]);
  assert.equal(f.api('customer-payments','POST',{invoiceId:'SI',date:f.today,amount:100,paymentMethod:'Tunai',accountId:'CASH'}).success,false);
  assert.equal(f.balance(),0);
});

run('mixed legacy database collations do not break balances or supplier repair',t=>{
  const f=fixture(t);f.journal([['LC',100,0],['EQ',0,100]]);
  f.sql('ALTER TABLE cash_accounts MODIFY ledger_account_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
  f.sql('ALTER TABLE purchase_payments MODIFY id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
  assert.equal(f.balance(),100);assert.equal(f.report().data.closingBalance,100);
  assert.equal(f.call({op:'repair'}).data.repaired,0);
});

run('COA balances and history include posted subaccounts with normal debit/credit and matching branch/date',t=>{
  const f=fixture(t),previous=new Date(`${f.today}T00:00:00Z`);previous.setUTCDate(previous.getUTCDate()-1);const before=previous.toISOString().slice(0,10);
  f.sql("INSERT INTO chart_of_accounts(id,code,name,account_type,detail_type,normal_balance) VALUES('ROOT','1000','Aset','Asset','Aset Lancar Lainnya','Debit'),('CONTRA','1900','Akumulasi','Asset','Akumulasi Penyusutan','Credit')");
  f.sql("UPDATE chart_of_accounts SET parent_id='ROOT' WHERE id IN ('LC','LB','CONTRA')");
  f.journal([['LC',1000,0],['EQ',0,1000]],{sourceType:'opening_balance',date:before});
  f.journal([['EXP',200,0],['LC',0,200]]);
  f.journal([['LB',100,0],['EQ',0,100]]);
  f.journal([['EXP',50,0],['CONTRA',0,50]]);
  f.journal([['LC',999,0],['EQ',0,999]],{posted:0,status:'Draft'});
  f.journal([['LB',300,0],['EQ',0,300]],{date:'2099-01-01'});
  f.journal([['LB',500,0],['EQ',0,500]],{branchId:'B2'});
  const query={includeBalances:'1',asOf:f.today,branchId:'B1'};
  const response=f.api('chart-of-accounts','GET',{}, {query});assert.equal(response.success,true,JSON.stringify(response));const accounts=Object.fromEntries(response.data.map(a=>[a.id,a]));
  assert.equal(accounts.LC.balance,800);assert.equal(accounts.LB.balance,100);assert.equal(accounts.CONTRA.balance,50);assert.equal(accounts.EQ.balance,1100);assert.equal(accounts.ROOT.balance,850);assert.equal(accounts.ROOT.openingBalance,1000);assert.equal(accounts.ROOT.openingBalanceDate,before);assert.equal(accounts.ROOT.includesSubaccounts,true);assert.equal(accounts.FREE.balance,0);
  const history=f.api('general-ledger','GET',{}, {query:{accountId:'ROOT',includeSubaccounts:'1',branchId:'B1',from:f.today,to:f.today}}).data;
  assert.equal(history.openingBalance,1000);assert.equal(history.closingBalance,accounts.ROOT.balance);assert.equal(history.rows.length,3);assert.equal(history.includesSubaccounts,true);
  const old=f.api('chart-of-accounts','GET',{}, {query:{...query,asOf:before}}).data;assert.equal(old.find(a=>a.id==='ROOT').balance,1000);
  const plain=f.api('chart-of-accounts').data;assert.equal(Object.hasOwn(plain[0],'balance'),false);assert.equal(plain.length,response.data.length);
});

run('COA read balances reject invalid dates and inaccessible branches and retain exact line identities',t=>{
  const f=fixture(t);f.journal([['LC',30,0],['LC',20,0],['EQ',0,50]],{sourceType:'manual'});f.journal([['LB',500,0],['EQ',0,500]],{branchId:'B2'});
  const response=f.api('chart-of-accounts','GET',{}, {restricted:true,query:{includeBalances:'1',asOf:f.today}});assert.equal(response.success,true);assert.equal(response.data.find(a=>a.id==='LC').balance,50);assert.equal(response.data.find(a=>a.id==='LB').balance,0);
  assert.equal(f.api('chart-of-accounts','GET',{}, {restricted:true,query:{includeBalances:'1',asOf:f.today,branchId:'B2'}}).status,403);
  assert.equal(f.api('chart-of-accounts','GET',{}, {query:{includeBalances:'1',asOf:'2026-02-30'}}).status,422);
  const history=f.api('general-ledger','GET',{}, {query:{accountId:'LC',includeSubaccounts:'1',from:f.today,to:f.today,branchId:'ALL'}}).data;
  assert.equal(history.rows.length,2);assert.equal(new Set(history.rows.map(r=>r.lineId)).size,2);assert.equal(history.closingBalance,50);assert.equal(history.rows[0].sourceType,'manual');
  assert.equal(f.api('general-ledger','GET',{}, {query:{accountId:'missing',includeSubaccounts:'1',from:f.today,to:f.today}}).status,422);
});
