const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('script.js','utf8');
function mobileSetup(userAgent='iPhone',sharing=true){
  const elements=[],events=[],timers=[];
  const context=vm.createContext({
    window:{}, navigator:{userAgent,canShare:()=>sharing,share:async()=>events.push('share')},
    File,URL:{createObjectURL:()=> 'blob:ready',revokeObjectURL:()=>events.push('revoke')},
    setTimeout:(fn,delay)=>timers.push({fn,delay}),
    document:{activeElement:{focus(){}},body:{appendChild(){}},createElement(tag){
      const listeners={};
      const el={tag,children:[],style:{},setAttribute(){},append(...items){this.children.push(...items);},
        appendChild(item){this.children.push(item);},addEventListener(type,fn){listeners[type]=fn;},
        showModal(){events.push('dialog');},close(){listeners.close?.();},remove(){events.push('remove');}};
      elements.push(el);return el;
    }},toast:()=>{},
  });
  vm.runInContext(source.slice(source.indexOf('let closeMobileExport='),source.indexOf('function dataURLToBlob(')),context);
  return {context,elements,events,timers};
}
for(const agent of ['iPhone','Android','iPad']) test(agent+' prepares a file without opening a window, then shares on tap',async()=>{
  const app=mobileSetup(agent);
  app.context.downloadBlobFile(new Blob(['art'],{type:'image/png'}),'art.png');
  assert.deepEqual(app.events,['dialog']);
  const share=app.elements.find(el=>el.textContent==='Share / Save to Files');
  await share.onclick();
  assert.deepEqual(app.events,['dialog','share']);
  const link=app.elements.find(el=>el.tag==='a');
  assert.equal(link.download,'art.png');assert.equal(link.href,'blob:ready');
  assert.equal(app.timers.length,0);
  app.elements.find(el=>el.textContent==='Done').onclick();
  assert.equal(app.timers[0].delay,60000);
});
test('unsupported file sharing retains a directly tapped download',()=>{
  const app=mobileSetup('iPhone',false);
  app.context.downloadBlobFile(new Blob(['zip']),'art.zip');
  assert.equal(app.elements.some(el=>el.textContent==='Share / Save to Files'),false);
  assert.equal(app.elements.find(el=>el.tag==='a').download,'art.zip');
});
test('cancelled mobile share keeps the file available',async()=>{
  const app=mobileSetup();
  app.context.navigator.share=async()=>{throw Object.assign(new Error(),{name:'AbortError'});};
  app.context.downloadBlobFile(new Blob(['art']),'art.png');
  const button=app.elements.find(el=>el.textContent==='Share / Save to Files');
  await button.onclick();
  assert.equal(button.disabled,false);
  assert.ok(app.elements.some(el=>el.textContent==='Sharing cancelled. Your file is still ready.'));
  assert.equal(app.events.includes('remove'),false);
});
test('iPad desktop user agent uses mobile export flow',()=>{
  const app=mobileSetup('Macintosh');
  Object.assign(app.context.navigator,{platform:'MacIntel',maxTouchPoints:5});
  app.context.downloadBlobFile(new Blob(['art']),'art.png');
  assert.deepEqual(app.events,['dialog']);
});
