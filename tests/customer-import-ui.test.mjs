import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const enabled=process.env.CUSTOMER_IMPORT_UI_TEST==='1';
test('local Customers UI + real PHP endpoint smoke, auth, retry and mobile preview', {skip:!enabled && 'Set CUSTOMER_IMPORT_UI_TEST=1 with disposable MySQL and PLAYWRIGHT_MODULE'},async()=>{
  assert.ok(process.env.CUSTOMER_IMPORT_TEST_PORT);assert.ok(process.env.PLAYWRIGHT_MODULE);
  const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
  const {createServer}=await import('vite'); const {default:react}=await import('@vitejs/plugin-react');const {default:tailwind}=await import('@tailwindcss/vite');
  const php=process.env.PHP_BINARY || 'php';
  const db = input => {const p=spawnSync(php,['tests/fixtures/customer-import-db.php'],{input:JSON.stringify(input),encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);};
  assert.equal(db({action:'setup'}).ok,true);
  mkdirSync('.codex-tmp',{recursive:true});
  writeFileSync('.codex-tmp/customer-import-ui.html','<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/tests/fixtures/customer-import-ui-main.tsx"></script></body></html>');
  const backend=spawn(php,['-S','127.0.0.1:8187','tests/fixtures/customer-import-db.php'],{stdio:'pipe'});let backendLog='';backend.stderr.on('data',v=>backendLog+=v);
  const vite=await createServer({configFile:false,root:process.cwd(),plugins:[react(),tailwind()],optimizeDeps:{entries:['.codex-tmp/customer-import-ui.html']},resolve:{alias:[{find:/.*context\/AppContext$/,replacement:resolve('tests/fixtures/customer-import-ui-context.ts')}]},server:{host:'127.0.0.1',port:5178,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:8187',changeOrigin:true}}}});
  let browser;
  try {
    await vite.listen();browser=await chromium.launch({headless:true,channel:'chrome'});
    const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const url='http://127.0.0.1:5178/.codex-tmp/customer-import-ui.html';
    await page.goto(url+'?noCreate=1');await page.getByPlaceholder('Cari akun, perusahaan, PIC, telepon, atau kendaraan...').waitFor();assert.equal(await page.getByRole('button',{name:'Import Customer',exact:true}).count(),0);
    await page.goto(url);await page.getByRole('button',{name:'Import Customer',exact:true}).click();
    const csv='name,phone,customer_category,accurate_id\nALI,081234567890,Cakalang,A\nAli,+6281234567890,Hertasning,B\nBUDI,0800000000,Umum,C\nABDIL 081207533379,081287533379,Umum,D';
    await page.getByLabel('File customer',{exact:true}).setInputFiles({name:'fixture.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
    await page.getByRole('button',{name:'Preview tanpa menyimpan'}).click();await page.getByText('Baru: 1',{exact:true}).waitFor();
    assert.equal(db({action:'snapshot'}).customers.length,0);
    await page.screenshot({path:'.codex-tmp/customer-import-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.codex-tmp/customer-import-mobile.png',fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('checkbox').check();
    // Server commits, but its response is lost. UI must keep payload + run ID and retry safely.
    let intercepted=false;
    await page.route('**/api/customers/import',async route=>{if(!intercepted){intercepted=true;await route.fetch();await route.abort();}else await route.continue();});
    await page.getByRole('button',{name:'Import 1 customer baru',exact:true}).click();
    await page.getByRole('button',{name:'Coba ulang aman / verifikasi hasil'}).waitFor();assert.equal(db({action:'snapshot'}).customers.length,1);
    await page.getByRole('button',{name:'Coba ulang aman / verifikasi hasil'}).click();await page.getByText(/Selesai\. 1 customer tersimpan/).waitFor();
    assert.equal(db({action:'snapshot'}).customers.length,1);
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Unduh laporan per baris'}).click();assert.equal((await download).suggestedFilename(),'laporan-import-customer.csv');
    await page.getByRole('button',{name:'Tutup',exact:true}).click();await page.getByText('Cakalang, Hertasning',{exact:true}).last().waitFor();
    // API checks use actual server permission/branch helpers with synthetic actors.
    const rows=[{rowNumber:2,name:'API FIXTURE',phone:'081234567891'}];
    const post=(path,body,actor='allowed')=>fetch('http://127.0.0.1:5178/api/customers/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Test-Actor':actor},body:JSON.stringify(body)});
    for(const [actor,branch,status] of [['anonymous','BR-TEST',401],['denied','BR-TEST',403],['allowed','00',403],['zero','00',403],['zero','0',200],['allowed','INACTIVE',403]]){
      const response=await post('import-preview',{rows,branchId:branch,source:'fixture.csv'},actor);assert.equal(response.status,status,await response.text());
    }
    assert.equal((await post('import-preview',{rows:[],branchId:'BR-TEST',source:'fixture.csv'})).status,422);
    assert.equal((await post('import-preview',{rows,branchId:'BR-TEST',source:'x'.repeat(8*1024*1024)})).status,413);
    const before=db({action:'snapshot'});
    const p=await (await post('import-preview',{rows,branchId:'BR-TEST',source:'fixture.csv'})).json();
    const run={rows,branchId:'BR-TEST',source:'fixture.csv',digest:p.data.digest,runId:crypto.randomUUID()};
    assert.equal((await post('import',run,'denied')).status,403);assert.deepEqual(db({action:'snapshot'}),before);
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('UI: desktop/mobile, permission, upload, server preview, lost response/retry, report and category refresh passed.');
  } finally {if(browser)await browser.close();await vite.close();backend.kill();}
});
