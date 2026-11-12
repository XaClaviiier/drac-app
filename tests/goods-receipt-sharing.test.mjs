import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGoodsReceiptShareText, receiptShippingCostLabel, receiptDeliveryOptions, validReceiptShippingCost } from '../src/lib/goodsReceiptSharing.ts';
import { newReceiptDraft, restoreReceiptDraft, validateReceiptShipping } from '../src/lib/aiGoodsReceipt.ts';
import { buildGoodsReceiptPrintHtml } from '../src/lib/goodsReceiptAcknowledgement.ts';

const receipt = { receiptNumber:'GR-SERVER-0099', date:'2026-11-12', deliveryMethod:'Maxim', shippingCost:25000,
  receivedBy:'Petugas A', status:'Diterima', items:[
    {itemCode:'ITEM-1',itemName:'Kompresor',qty:2,unit:'PCS'},
    {itemCode:'ITEM-2',itemName:'Paket Seal',qty:1,unit:'SET'},
  ] };
const location = { branchName:'CABANG PERINTIS', warehouseName:'GUDANG PERINTIS' };

test('receipt sharing includes saved number, date, location, all quantities, shipping and receiver', () => {
  const text=buildGoodsReceiptShareText(receipt,location);
  for(const value of ['GR-SERVER-0099','12 November 2026','CABANG PERINTIS','GUDANG PERINTIS','*Maxim*','*Rp25.000*','1. Kompresor','ITEM-1','*2 PCS*','2. Paket Seal','*1 SET*','Petugas A']) assert.ok(text.includes(value),value);
  assert.equal(buildGoodsReceiptShareText({...receipt,status:'Draft'},location),'');
  assert.equal(buildGoodsReceiptShareText({...receipt,status:'Batal'},location),'');
  assert.ok(buildGoodsReceiptShareText({...receipt,status:'Difakturkan'},location));
});

test('unknown legacy shipping costs remain distinct from explicit free shipping', () => {
  assert.equal(receiptShippingCostLabel(0),'Rp0');
  for(const value of [undefined,null,NaN,-1]) assert.equal(receiptShippingCostLabel(value),'Belum dicatat');
  assert.match(buildGoodsReceiptShareText({...receipt,deliveryMethod:'Diantar Supplier',shippingCost:null},location),/via: \*Supplier\*[\s\S]*Biaya kirim: \*Belum dicatat\*/);
});

test('receipt drafts retain shipping through reload and reject invalid money', () => {
  assert.deepEqual(receiptDeliveryOptions,['Grab','Maxim','Supplier','Karyawan']);
  assert.throws(()=>validateReceiptShipping(newReceiptDraft()),/Pilih pengiriman/);
  for(const deliveryMethod of receiptDeliveryOptions) {
    const restored=restoreReceiptDraft({...newReceiptDraft(),deliveryMethod,shippingCost:25000,stage:'confirm'});
    assert.equal(restored.deliveryMethod,deliveryMethod);assert.equal(restored.shippingCost,25000);assert.equal(restored.stage,'items');
    assert.doesNotThrow(()=>validateReceiptShipping(restored));
  }
  for(const shippingCost of [null,-1,1.5,Infinity,1000000000000,'25000']) {
    assert.equal(validReceiptShippingCost(shippingCost),false);
    assert.throws(()=>validateReceiptShipping({...newReceiptDraft(),deliveryMethod:'Grab',shippingCost}),/Biaya kirim/);
  }
  assert.equal(restoreReceiptDraft({...newReceiptDraft(),shippingCost:-1}).shippingCost,null);
  assert.equal(validReceiptShippingCost(0),true);
});

test('print acknowledgement includes the same shipping charge and escapes user text', () => {
  const html=buildGoodsReceiptPrintHtml({...receipt,...location,sourceName:'Supplier',notes:'<script>alert(1)</script>',doNumber:''});
  assert.match(html,/Biaya kirim/);assert.match(html,/Rp25\.000/);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});
