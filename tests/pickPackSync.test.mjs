import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(process.env.PICK_PACK_SOURCE || 'public/app.js','utf8');
const ast=ts.createSourceFile('app.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const code=name=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node,name);return node.getText(ast)};
function env(extra={}){const c={console:{warn(){}},navigator:{onLine:true},showToast(){},getLocalDraftPickSession:()=>null,localStorage:{getItem:()=> 'Operador'},...extra};vm.createContext(c);vm.runInContext('const operationalWriteChains=new Map(); let operationalQueueOrder=0; let conferenceProgressSyncPromise=Promise.resolve(); let conferenceProgressPendingOperations=[];',c);return c;}
function add(c,...names){vm.runInContext(names.map(code).join('\n'),c);}
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};

test('dois consumidores da fila não enviam a mesma operação ao mesmo tempo',async()=>{
 const gate=defer();let calls=0;let rows=[{id:'1',type:'supabase_progress',meta:{module:'conferencia'}}];
 const c=env({getQueuedOperations:async()=>rows,executeQueuedOperation:async()=>{calls++;await gate.promise},markQueuedOperation:async()=>{rows=[]},refreshOutboxPendingCount:async()=>{}});
 add(c,'runOperationalWrite','isPickPackOperation','syncOperationOutbox','drainOperationOutbox');
 const a=c.syncOperationOutbox('a',true),b=c.syncOperationOutbox('b',true);await new Promise(r=>setImmediate(r));assert.equal(calls,1);gate.resolve();await Promise.all([a,b]);assert.equal(calls,1);
});
test('progresso fica durável antes do envio e falha mantém a mesma operação na fila',async()=>{
 const events=[];const rows=[];
 const c=env({queueOperation:async(type,payload)=>{events.push('persistiu');const row={id:payload.operationId,type,payload};rows.push(row);return row},syncOperationOutbox:async()=>{events.push('enviou');assert.equal(rows.length,1)},getQueuedOperations:async()=>rows});
 add(c,'sendOrQueueProgressOperation');const result=await c.sendOrQueueProgressOperation({operationId:'op-fixa',flow:'conferencia'});assert.deepEqual(events,['persistiu','enviou']);assert.equal(result.queued,true);assert.equal(rows[0].payload.operationId,'op-fixa');
});
test('envio de separação/conferência não executa operações de outros módulos',async()=>{
 const sent=[];const rows=[{id:'nf',type:'supabase_romaneio',meta:{module:'romaneio'}},{id:'pick',type:'supabase_pick_draft'},{id:'pack',type:'supabase_progress',payload:{flow:'conferencia'}}];
 const c=env({getQueuedOperations:async()=>rows,executeQueuedOperation:async op=>sent.push(op.id),markQueuedOperation:async()=>{},refreshOutboxPendingCount:async()=>{}});add(c,'runOperationalWrite','isPickPackOperation','syncOperationOutbox','drainOperationOutbox');await c.syncOperationOutbox('teste',true);assert.deepEqual(sent,['pick','pack']);
});
test('leituras rápidas do mesmo item não repetem a quantidade já contabilizada',async()=>{
 const gate=defer(),deltas=[];const item={id_interno:'P',qty:1,_sync_qtd_separada:0};
 const c=env({getPickingProductId:x=>x.id_interno,buildPickingSessionPayload:()=>({}),buildPickingItemPayload:x=>({id_interno:x.id_interno,qtd_separada:x.qty}),PICK_STATUS_DRAFT:'rascunho',createProgressOperationId:()=>String(deltas.length),getProgressDeviceId:()=> 'device',currentSessionItems:[item],saveDraftPickSession(){},withTimeout:p=>p,DataClient:{savePickingDraftSupabase:async()=>{}},sendOrQueueProgressOperation:async p=>{deltas.push(p.delta);await gate.promise;return {queued:false}},isRetryableConferenceSyncError:()=>false});
 add(c,'runOperationalWrite','persistPickingDraftItem','persistPickingDraftItemSerial');const draft={sessionId:'S'};const first=c.persistPickingDraftItem(draft,item);await new Promise(r=>setImmediate(r));item.qty=2;const second=c.persistPickingDraftItem(draft,item);gate.resolve();await Promise.all([first,second]);assert.deepEqual(deltas,[1,1]);assert.equal(item._sync_qtd_separada,2);
});
test('a conferência preserva a operação que falhou ao gravar e tenta novamente',async()=>{
 let fail=true;const sent=[];const c=env({buildConferenceProgressOperations:()=>[],sendOrQueueProgressOperation:async p=>{sent.push(p.operationId);if(fail)throw Error('disco indisponível');return {queued:true}},syncOperationOutbox:async()=>{}});
 add(c,'scheduleConferenceProgressSync','flushConferenceProgressSync');await c.scheduleConferenceProgressSync(false,[{operationId:'mesma-op'}]);await assert.rejects(c.flushConferenceProgressSync(),/leituras/);fail=false;await c.flushConferenceProgressSync();assert.deepEqual(sent,['mesma-op','mesma-op','mesma-op']);
});
test('retomar bloqueia a substituição da cópia local quando a sessão tem envio pendente',async()=>{
 const c=env({pickPackageCloudSyncTimer:null,pickPackageCloudSyncChain:Promise.resolve(),flushConferenceProgressSync:async()=>{},getQueuedOperations:async()=>[{type:'supabase_progress',meta:{module:'separacao',sessionId:'S'}}]});add(c,'isPickPackOperation','preparePickPackResume');assert.equal(await c.preparePickPackResume('S'),false);assert.equal(await c.preparePickPackResume('outra'),true);
});
test('separação encerrada em outra máquina não é retomada pelo cache antigo',async()=>{
 let warned=false;const c=env({preparePickPackResume:async()=>true,appData:{separacao:[{separacao_id:'S',status:'rascunho'}]},DataClient:{loadModule:async()=>({separacao:[{separacao_id:'S',status:'finalizada'}],separacao_itens:[]})},isDraftPickSession:x=>x.status==='rascunho',renderPickMenu:async()=>{},showToast:()=>{warned=true}});add(c,'resumePickingDraftFromServer');await c.resumePickingDraftFromServer('S');assert.equal(warned,true);assert.equal(c.appData.separacao[0].status,'finalizada');
});
function conferenceEnv(online){const stop=Error('frame');const local={id:'S',conference_progress_updated_at:'2099-01-01',conferenceRows:[{id_interno:'P',qtd_conferida:8,_sync_qtd_conferida:8}]};const c=env({navigator:{onLine:online},preparePickPackResume:async()=>true,conferenceKitSelection:{clear(){}},appData:{},DataClient:{loadModule:async()=>({separacao:[{separacao_id:'S'}]}),buscarConferenciaAndamentoSupabase:async()=>({estado_andamento:{id:'S',conferenceRows:[{id_interno:'P',qtd_conferida:0}]},itens:[{id_interno:'P',qtd_conferida:0}]})},getActivePickSessions:()=>[local],getPackSeparationUniqueId:()=> 'S',getPackSeparationSessionId:()=> 'S',isSeparationPendingConferenceSession:()=>true,isSameConferenceOperator:()=>false,getChannelConfig:()=>({}),renderPackSessionFrame:()=>{throw stop}});add(c,'renderPackSessionDetails');return {c,stop};}
test('conferência usa zero remoto mesmo com relógio local adiantado',async()=>{const {c,stop}=conferenceEnv(true);await assert.rejects(c.renderPackSessionDetails('S'),e=>e===stop);assert.equal(c.currentPackSession.conferenceRows[0].qtd_conferida,0);assert.equal(c.currentPackSession.conferenceRows[0]._sync_qtd_conferida,0)});
test('retomada offline mantém o progresso local e sua referência de envio',async()=>{const {c,stop}=conferenceEnv(false);await assert.rejects(c.renderPackSessionDetails('S'),e=>e===stop);assert.equal(c.currentPackSession.conferenceRows[0].qtd_conferida,8);assert.equal(c.currentPackSession.conferenceRows[0]._sync_qtd_conferida,8)});

test('fila mantém a ordem mesmo para operações criadas no mesmo milissegundo',async()=>{
 const storage=new Map();let id=0;const c=env({Date:class extends Date{static now(){return 1000}},generateExecutionId:()=>String(++id),getDataHoraBrasil:()=> '2026-09-02T10:00:00',openOperationOutboxDB:async()=>{throw Error('sem indexedDB')},refreshOutboxPendingCount:async()=>{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});add(c,'queueOperation','getQueuedOperations');const first=await c.queueOperation('supabase_progress',{},{queueKey:'Z'}),second=await c.queueOperation('supabase_progress',{},{queueKey:'A'});assert.ok(second.queueOrder>first.queueOrder);assert.deepEqual(Array.from(await c.getQueuedOperations(),x=>x.id),['Z','A']);
});
test('rascunho local encerrado no servidor não reaparece como pendência',()=>{
 const c=env({appData:{separacao:[{separacao_id:'S',status:'finalizada'}]},getDraftPickSessionsFromCache:()=>[],getLocalDraftPickSessionsList:()=>[{sessionId:'S',saveStatus:'synced'}],getDraftPickSession:()=>null,getPackSeparationSessionId:s=>s.separacao_id,isDraftPickSession:s=>s.status==='rascunho'});add(c,'getDraftPickSessionsWithLocalDraft');assert.equal(c.getDraftPickSessionsWithLocalDraft(true).length,0);c.appData.separacao=[];assert.equal(c.getDraftPickSessionsWithLocalDraft(true).length,0);
});
test('pacotes agendados mantêm o identificador da sessão de origem ao trocar de tela',async()=>{
 let callback,received;const c=env({pickPackageCloudSyncTimer:null,pendingPickPackageSnapshot:null,currentPickingContext:{sessionId:'A'},currentSessionItems:[{id_interno:'P',qty:1}],clearTimeout(){},setTimeout:fn=>{callback=fn;return 1},syncPickPackagesWithCloud:async p=>{received=p}});add(c,'schedulePickPackagesCloudSync');c.schedulePickPackagesCloudSync();c.currentPickingContext={sessionId:'B'};c.currentSessionItems[0].qty=9;callback();await Promise.resolve();assert.equal(received.sessionId,'A');assert.equal(received.items[0].qty,1);
});

function discardEnv(fail=false){const events=[];const c=env({navigator:{onLine:false},getLocalDraftPickSession:()=>({sessionId:'S'}),getDraftPickSession:()=>null,currentPickingContext:{sessionId:'S'},appData:{separacao:[],separacao_itens:[]},removeQueuedPickingDraftOperations:async()=>{},queueOperation:async()=>{if(fail)throw Error('sem armazenamento');events.push('fila')},getQueuedOperations:async()=>[{id:'discard-pick:S'}],localStorage:{removeItem:()=>events.push('limpeza')},PICK_CURRENT_DRAFT_STORAGE_KEY:'draft',removeLocalDraftPickSession:()=>events.push('limpeza'),clearPickSearchSuggestions(){}});add(c,'discardPickingDraft');return {c,events};}
test('exclusão offline é preservada antes de limpar o rascunho',async()=>{const {c,events}=discardEnv();assert.equal(await c.discardPickingDraft('S'),true);assert.equal(events[0],'fila');assert.ok(events.includes('limpeza'));});
test('falha ao preservar a exclusão mantém o rascunho local',async()=>{const {c,events}=discardEnv(true);assert.equal(await c.discardPickingDraft('S'),false);assert.equal(events.length,0);});
