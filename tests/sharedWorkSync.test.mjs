import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('public/sharedWorkSync.js','utf8'),context);
const factory=context.createSharedWorkSync;
const clone=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const records={nf:{},romaneio:{}};let loseReply=false;
 const rpc=async(name,p)=>{
  if(name==='registrar_sessao_operacional')return {aprovado:true};
  if(name==='listar_registros_operacionais')return clone(Object.values(records[p.p_fluxo]).filter(x=>x.id>p.p_depois).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,100));
  if(name==='obter_registro_operacional')return clone(records[p.p_fluxo][p.p_id]||null);
  const bucket=records[p.p_fluxo],old=bucket[p.p_id];
  if(old?.op===p.p_operacao)return clone(old);
  if((old?.revisao||0)!==p.p_revisao||old&&old.status_sync!=='ativo')throw Object.assign(Error('Conflito'),{code:'PT409'});
  const row={id:p.p_id,dados:clone(p.p_dados),revisao:(old?.revisao||0)+1,status_sync:p.p_status,op:p.p_operacao};bucket[p.p_id]=row;
  if(loseReply){loseReply=false;throw Error('Resposta perdida');}return clone(row);
 };
 function machine(legacy={nf:[],romaneio:[]},disk={}){
  let online=true;const backups=[];
  const engine=factory({read:async()=>disk.value,write:async x=>{disk.value=clone(x);},backup:async(...x)=>backups.push(x),legacy:f=>legacy[f],uuid:randomUUID,online:()=>online,deviceId:()=>randomUUID(),rpc});
  return {engine,disk,backups,offline:()=>{online=false;},online:()=>{online=true;}};
 }
 return {records,machine,lose:()=>{loseReply=true;}};
}
test('migra rascunho local e permite continuar em outro aparelho',async()=>{
 const s=setup(),a=s.machine({nf:[{chave_acesso:'1',numero_nf:'12'}],romaneio:[]}),b=s.machine();await a.engine.refresh();await b.engine.refresh();assert.equal(b.engine.list('nf')[0].numero_nf,'12');assert.equal(Object.keys(s.records.nf).length,1);
});
test('fila offline sobrevive reinicialização e não duplica',async()=>{
 const s=setup(),a=s.machine();a.offline();await a.engine.capture('nf','2',{chave_acesso:'2',currentStep:'produtos'});await a.engine.refresh();const restart=s.machine(undefined,a.disk);await restart.engine.refresh();await restart.engine.refresh();assert.equal(s.records.nf['2'].revisao,1);assert.equal(restart.engine.status().pending,0);
});
test('edições simultâneas preservam conflito e cópia local',async()=>{
 const s=setup(),a=s.machine(),b=s.machine();await a.engine.capture('nf','3',{chave_acesso:'3',value:'inicial'});await a.engine.refresh();await b.engine.refresh();
 await a.engine.capture('nf','3',{chave_acesso:'3',value:'A'});await b.engine.capture('nf','3',{chave_acesso:'3',value:'B'});await a.engine.refresh();await b.engine.refresh();
 assert.equal(s.records.nf['3'].dados.value,'A');assert.equal(b.engine.list('nf')[0].value,'B');assert.equal(b.engine.status().conflicts.length,1);
 await b.engine.useRemote('nf','3');assert.equal(b.backups[0][2].data.value,'B');assert.equal(b.engine.list('nf')[0].value,'A');
});
test('formulário aberto mantém revisão original quando outra máquina altera',async()=>{
 const s=setup(),a=s.machine(),b=s.machine();await a.engine.capture('nf','4',{chave_acesso:'4',value:'inicial'});await a.engine.refresh();await b.engine.refresh();b.engine.beginEdit('nf','4');
 await a.engine.capture('nf','4',{chave_acesso:'4',value:'A'});await a.engine.refresh();await b.engine.refresh();await b.engine.capture('nf','4',{chave_acesso:'4',value:'B'});await b.engine.refresh();assert.equal(s.records.nf['4'].dados.value,'A');assert.equal(b.engine.status().conflicts.length,1);
});
test('resposta perdida repete operação de modo idempotente',async()=>{
 const s=setup(),a=s.machine();await a.engine.capture('romaneio','R1',{id:'R1',assinatura:'imagem'});s.lose();await a.engine.refresh();await a.engine.refresh();assert.equal(s.records.romaneio.R1.revisao,1);assert.equal(a.engine.status().pending,0);
});
test('rascunho descartado desaparece nos outros aparelhos e não ressuscita',async()=>{
 const s=setup(),a=s.machine(),b=s.machine();await a.engine.capture('nf','5',{chave_acesso:'5'});await a.engine.refresh();await b.engine.refresh();await a.engine.capture('nf','5',{chave_acesso:'5'},'descartado');await a.engine.refresh();await b.engine.refresh();assert.equal(b.engine.list('nf').length,0);await assert.rejects(()=>b.engine.capture('nf','5',{chave_acesso:'5'}));
});
test('envio de uma edição não apaga edição feita durante a requisição',async()=>{
 const s=setup(),a=s.machine();await a.engine.capture('nf','6',{chave_acesso:'6',value:1});await a.engine.refresh();a.engine.beginEdit('nf','6');await a.engine.capture('nf','6',{chave_acesso:'6',value:2});const syncing=a.engine.refresh();await a.engine.capture('nf','6',{chave_acesso:'6',value:3});await syncing;await a.engine.refresh();assert.equal(s.records.nf['6'].dados.value,3);
});
test('histórico pagina além de 100 registros',async()=>{
 const s=setup();for(let i=0;i<205;i++){const id=String(i).padStart(3,'0');s.records.romaneio[id]={id,dados:{id},revisao:1,status_sync:'ativo'};}const a=s.machine();await a.engine.refresh();assert.equal(a.engine.list('romaneio').length,205);
});

test('fila antiga não sobrescreve registro mais recente já sincronizado',async()=>{
 const s=setup(),a=s.machine();await a.engine.capture('romaneio','R2',{id:'R2',status:'Atual'});await a.engine.refresh();await a.engine.importLegacy('romaneio','R2',{id:'R2',status:'Antigo'});await a.engine.refresh();assert.equal(s.records.romaneio.R2.dados.status,'Atual');assert.equal(a.backups[0][2].data.status,'Antigo');
});
