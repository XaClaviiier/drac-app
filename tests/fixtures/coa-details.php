<?php
class CoaTestPDO extends PDO {
    public function query(string $q, ?int $fetchMode=null, mixed ...$args): PDOStatement|false {return parent::query(str_replace(' FOR UPDATE','',$q));}
}
$input=json_decode($argv[2],true);$method=$input['method'];$id=$input['id']??null;$requestUser=['id'=>'test'];
$pdo=new CoaTestPDO('sqlite:'.$argv[1]);$pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);
$pdo->exec('CREATE TABLE IF NOT EXISTS chart_of_accounts(id TEXT PRIMARY KEY,code TEXT UNIQUE,name TEXT,account_type TEXT,parent_id TEXT,normal_balance TEXT,is_active INTEGER,detail_type TEXT DEFAULT "",notes TEXT,revision INTEGER DEFAULT 0);CREATE TABLE IF NOT EXISTS cash_accounts(ledger_account_id TEXT);CREATE TABLE IF NOT EXISTS branch_account_settings(receivable_coa_id TEXT,service_revenue_coa_id TEXT,goods_revenue_coa_id TEXT,inventory_coa_id TEXT);');
$pdo->exec('CREATE TABLE IF NOT EXISTS journal_lines(account_id TEXT)');
function getInput(){global $input;return $input['payload']??[];}
function lockInventoryMutation($pdo){}
function lockInventoryMutationAuthorization($pdo,$user,$permission){global $input;if(!empty($input['deny']))throw new DomainException('Tidak diizinkan',403);}
function generateId(){return bin2hex(random_bytes(12));}
function respondSuccess($data,$message=''){echo json_encode(['success'=>true,'data'=>$data,'message'=>$message]);exit;}
function respondError($message,$status){echo json_encode(['success'=>false,'message'=>$message,'status'=>$status]);exit;}
if(!function_exists('mb_strlen')){function mb_strlen($s){return preg_match_all('/./us',$s);}}
require __DIR__.'/../../api/endpoints/chart-of-accounts.php';
