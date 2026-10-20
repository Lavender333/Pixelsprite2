const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('script.js','utf8');
function setup(usedMs,pro=false){
  const prompts=[];
  const ctx=vm.createContext({ST:{freeSessionUsedMs:usedMs},isClubAccount:()=>pro,
    openProInfo:reason=>prompts.push(reason),toast(){},setTimeout:fn=>fn(),
    localStorage:{getItem:()=>String(usedMs),setItem(){}},dayStamp:()=> '2026-10-20'});
  vm.runInContext(source.slice(source.indexOf('function requireClubFeature('),source.indexOf('function saveLocalAccountTier(')),ctx);
  return {ctx,prompts};
}
for(const minutes of [0,5,90,10000]) test(`free creator can continue after ${minutes} minutes without an automatic offer`,()=>{
  const {ctx,prompts}=setup(minutes*60000);
  assert.equal(ctx.canStartCreativeSession(),true);
  ctx.maybeShowSuccessUpgradePrompt('success');
  assert.deepEqual(prompts,[]);
});
test('explicit paid feature still offers Plus to free users',()=>{
  const {ctx,prompts}=setup(0);
  assert.equal(ctx.requireClubFeature('specialty exports'),false);
  assert.deepEqual(prompts,['feature']);
});
test('Plus users can access paid features without another offer',()=>{
  const {ctx,prompts}=setup(0,true);
  assert.equal(ctx.requireClubFeature('specialty exports'),true);
  assert.deepEqual(prompts,[]);
});
