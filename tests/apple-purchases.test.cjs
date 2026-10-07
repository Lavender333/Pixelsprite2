const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('script.js','utf8');
const section=source.slice(source.indexOf('let applePurchaseBusy'),source.indexOf('\nfunction requireClubFeature'));
function setup(plugin,platform='ios'){
  const tiers=[],messages=[];
  const context=vm.createContext({
    window:{Capacitor:{getPlatform:()=>platform,registerPlugin:()=>plugin},addEventListener(){}},
    document:{addEventListener(){},querySelector:()=>null},
    IAP_PRODUCTS:{monthly:{id:'Monthly',label:'Plus',price:'$1.99'}},
    saveLocalAccountTier:t=>tiers.push(t),syncAuthUI(){},buildProfile(){},closeProInfo(){},
    toast:t=>messages.push(t),console
  });
  vm.runInContext(section,context);
  return {context,tiers,messages};
}
for(const status of ['cancelled','pending']) test(`${status} never unlocks Plus`,async()=>{
  const {context,tiers}=setup({purchaseProduct:async()=>({status})});
  assert.equal((await context.startIAPPurchase()).ok,false);
  assert.deepEqual(tiers,[]);
});
test('verified active purchase unlocks',async()=>{
  const {context,tiers}=setup({purchaseProduct:async({productId})=>{
    assert.equal(productId,'Monthly');return {status:'purchased',verified:true,active:true};
  }});
  assert.equal((await context.startIAPPurchase()).ok,true);
  assert.deepEqual(tiers,['pro']);
});
test('unverified purchase cannot unlock',async()=>{
  const {context,tiers}=setup({purchaseProduct:async()=>({status:'purchased',active:true})});
  assert.equal((await context.startIAPPurchase()).ok,false);
  assert.deepEqual(tiers,[]);
});
test('expired entitlement removes Plus',async()=>{
  const {context,tiers}=setup({getEntitlements:async()=>({verified:true,active:false})});
  await context.refreshApplePurchases();assert.deepEqual(tiers,['free']);
});
test('restore verified subscription',async()=>{
  const {context,tiers}=setup({restorePurchases:async()=>({verified:true,active:true})});
  await context.restoreApplePurchases();assert.deepEqual(tiers,['pro']);
});
test('website never invokes Apple purchase',async()=>{
  const {context}=setup({purchaseProduct:()=>{throw Error('must not be called');}},'web');
  assert.equal((await context.startIAPPurchase()).reason,'ios-required');
});
test('duplicate taps start one purchase',async()=>{
  let finish;let calls=0;
  const {context}=setup({purchaseProduct:()=>{calls++;return new Promise(r=>finish=r);}});
  const first=context.startIAPPurchase();
  assert.equal((await context.startIAPPurchase()).reason,'busy');
  finish({status:'cancelled'});await first;assert.equal(calls,1);
});
test('bridge errors leave Plus locked and allow retry',async()=>{
  const {context,tiers}=setup({purchaseProduct:async()=>{throw Error('product unavailable');}});
  assert.equal((await context.startIAPPurchase()).ok,false);
  assert.equal((await context.startIAPPurchase()).reason,undefined);
  assert.deepEqual(tiers,[]);
});
