/* Persistência de entradas e romaneios. Não executa movimentos de estoque. */
(function (root) {
  'use strict';
  function createSharedWorkSync(env) {
    let state = { nf: {}, romaneio: {} }, ready = false, initPromise, running;
    let approved = false, lastError = '', saving = Promise.resolve();
    const editing = new Map();
    const copy = value => JSON.parse(JSON.stringify(value));
    const emit = () => env.changed?.();
    function persist() {
      const snapshot = copy(state);
      saving = saving.catch(() => {}).then(() => env.write(snapshot));
      return saving;
    }
    function fail(error) { lastError = error.message || 'Falha na sincronização'; emit(); }
    async function init() {
      if (!initPromise) initPromise = (async () => {
        const stored = await env.read();
        if (stored) state = stored;
        for (const flow of ['nf', 'romaneio']) {
          state[flow] ||= {};
          for (const item of env.legacy(flow)) {
            const id = String(flow === 'nf' ? item.chave_acesso || '' : item.id || '');
            if (id && !state[flow][id]) state[flow][id] = { id, data: item, rev: 0, status: 'ativo', pending: true, op: env.uuid(), seq: 1 };
          }
        }
        await persist(); ready = true; emit();
      })();
      return initPromise;
    }
    async function capture(flow, id, data, status = 'ativo') {
      await init();
      const old = state[flow][id];
      if (old?.status !== 'ativo' && old?.rev > 0) throw Error('Este registro foi encerrado em outro aparelho.');
      state[flow][id] = { ...old, id, data: copy(data), rev: editing.get(flow+':'+id) ?? old?.rev ?? 0, status, pending: true,
        op: env.uuid(), seq: (old?.seq || 0) + 1, error: '' };
      await persist(); emit();
    }
    async function importLegacy(flow,id,data) {
      await init();
      if (state[flow][id]) {
        if (JSON.stringify(state[flow][id].data)!==JSON.stringify(data)) await env.backup(flow,id,{data:copy(data),source:'fila_anterior'});
        return;
      }
      await capture(flow,id,data);
    }
    function list(flow) {
      return Object.values(state[flow] || {}).filter(e => e.status === 'ativo').map(e => copy(e.data));
    }
    async function authorize(user, pin) {
      await init();
      await env.rpc('registrar_sessao_operacional', { p_device_id: env.deviceId() });
      const result = await env.rpc('autorizar_sessao_operacional', { p_usuario: user, p_pin: pin });
      if (!result?.aprovado) throw Error(result?.erro || 'Aparelho não autorizado.');
      approved = true; lastError = ''; return refresh();
    }
    async function pull(flow) {
      let after = '';
      do {
        const rows = await env.rpc('listar_registros_operacionais', { p_fluxo: flow, p_depois: after });
        for (const row of rows) {
          const old = state[flow][row.id];
          if (old?.pending || editing.has(flow+':'+row.id)) {
            if (old.rev !== row.revisao && !old.uncertain) old.conflict = row;
            continue;
          }
          if (old && old.rev === row.revisao) continue;
          state[flow][row.id] = { id: row.id, data: row.dados, rev: row.revisao, status: row.status_sync,
            pending: false, seq: old?.seq || 0, details: flow !== 'romaneio' };
        }
        if (rows.length < 100) break;
        const next = rows[rows.length - 1].id;
        if (next === after) throw Error('Paginação de sincronização inválida.');
        after = next;
      } while (true);
      await persist();
    }
    async function send(flow, entry) {
      if (!entry.pending || entry.conflict) return;
      const sent = copy(entry);
      try {
        const row = await env.rpc('salvar_registro_operacional', {
          p_fluxo: flow, p_id: sent.id, p_dados: sent.data, p_revisao: sent.rev,
          p_operacao: sent.op, p_status: sent.status
        });
        const current = state[flow][sent.id];
        current.rev = row.revisao;
        if (editing.get(flow+':'+sent.id) === sent.rev) editing.set(flow+':'+sent.id, row.revisao);
        if (current.seq === sent.seq) {
          current.pending = false; current.data = row.dados; current.status = row.status_sync;
          current.details = true; current.error = ''; current.uncertain = false; delete current.conflict;
        }
      } catch (error) {
        const current = state[flow][sent.id];
        current.uncertain = error.code !== 'PT409' && error.code !== '42501';
        current.error = error.code === 'PT409' ? 'Alterado ou encerrado em outro aparelho.' : 'Não enviado. Sua cópia está preservada neste aparelho.';
        if (error.code === 'PT409') current.conflict = await env.rpc('obter_registro_operacional', {p_fluxo:flow,p_id:sent.id}) || {status_sync:'importado',dados:{},revisao:sent.rev};
        else if (error.code === '42501') approved = false;
      }
      await persist();
    }
    async function refresh() {
      if (running) return running;
      running = (async () => {
        await init(); await saving;
        if (!env.online()) { lastError = 'Sem conexão. Alterações aguardam envio neste aparelho.'; return; }
        const access = await env.rpc('registrar_sessao_operacional', {p_device_id:env.deviceId()});
        approved = access?.aprovado === true;
        if (!approved) { lastError = 'Autorize este aparelho para compartilhar os registros.'; return; }
        lastError = '';
        // Enviar antes de consultar permite repetir o mesmo ID após perda da resposta.
        for (const flow of ['nf','romaneio']) {
          for (const entry of Object.values(state[flow])) await send(flow, entry);
          await pull(flow);
        }
      })().catch(fail).finally(() => { running = null; emit(); });
      return running;
    }
    async function ensureSynced(flow, id) {
      await refresh();
      const entry = state[flow][id];
      if (!env.online() || !approved || !entry || entry.pending || entry.conflict) throw Error('Sincronize e resolva as pendências deste registro antes de continuar.');
      // Detecta mudanças remotas antes de retomar ou importar.
      const row = await env.rpc('obter_registro_operacional',{p_fluxo:flow,p_id:id});
      if (!row || row.revisao !== entry.rev || row.status_sync !== 'ativo') throw Error('Registro alterado em outro aparelho. Atualize a lista antes de continuar.');
      return row;
    }
    async function detail(flow,id) {
      await init();
      const entry = state[flow][id];
      if (!entry) return null;
      if (entry.pending || entry.details) return copy(entry.data);
      if (!env.online()) throw Error('Conecte este aparelho para baixar as fotos e assinaturas deste romaneio.');
      const row = await env.rpc('obter_registro_operacional',{p_fluxo:flow,p_id:id});
      if (!row) throw Error('Registro não encontrado.');
      if (!state[flow][id].pending) state[flow][id] = {...entry,data:row.dados,rev:row.revisao,status:row.status_sync,details:true};
      await persist(); return copy(state[flow][id].data);
    }
    async function useRemote(flow,id) {
      const entry = state[flow][id];
      if (!entry?.conflict) return;
      // Exige cópia durável antes de adotar a versão compartilhada.
      await env.backup(flow,id,copy(entry));
      const row = await env.rpc('obter_registro_operacional',{p_fluxo:flow,p_id:id}) || entry.conflict;
      editing.delete(flow+':'+id);
      state[flow][id] = {id,data:row.dados,rev:row.revisao,status:row.status_sync,pending:false,details:true};
      await persist(); emit();
    }
    function status() {
      const entries = Object.values(state).flatMap(Object.values);
      return {ready,approved,running:!!running,error:lastError,pending:entries.filter(e=>e.pending).length,
        conflicts:Object.entries(state).flatMap(([flow,items])=>Object.values(items).filter(e=>e.conflict).map(e=>({flow,id:e.id}))),
        failed:entries.some(e=>e.error)};
    }
    return {init,capture,importLegacy,list,refresh,authorize,ensureSynced,detail,useRemote,status,
      beginEdit:(flow,id)=>{if(!editing.has(flow+':'+id))editing.set(flow+':'+id,state[flow][id]?.rev||0);},
      endEdit:()=>editing.clear(),localCopy:(flow,id)=>copy(state[flow][id]?.data||{}),ready:()=>ready};
  }
  root.createSharedWorkSync = createSharedWorkSync;
  if (!root.document) return;
  let database, token, service, timer, lastRefresh = 0, activeScope = '';
  function db() {
    if (!database) database = new Promise((resolve,reject) => {
      const req=indexedDB.open('dy-operational-shared',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('records');
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
    return database;
  }
  async function record(key,value,write=false) {
    const database=await db();
    return new Promise((resolve,reject)=>{
      const tx=database.transaction('records',write?'readwrite':'readonly');
      const req=write?tx.objectStore('records').put(value,key):tx.objectStore('records').get(key);
      tx.oncomplete=()=>resolve(req.result); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error||Error('Não foi possível preservar a cópia local.'));
    });
  }
  function legacy(flow) {
    try {
      if(flow==='romaneio') return JSON.parse(localStorage.getItem('dyRomaneiosRetiradaV2')||'[]');
      const items=JSON.parse(localStorage.getItem('entrada_nf_xml_drafts')||'[]');
      const single=JSON.parse(localStorage.getItem('entrada_nf_xml_draft')||'null');
      if(single?.chave_acesso&&!items.some(x=>x.chave_acesso===single.chave_acesso))items.push(single);
      return items.filter(x=>x?.chave_acesso&&!x.savedEntradaId);
    } catch { throw Error('Há registros locais que não puderam ser lidos. Preserve os dados deste aparelho.'); }
  }
  function client() { if(!root.supabaseClient)throw Error('Conexão indisponível.'); return root.supabaseClient; }
  function getService() {
    const scope=client().supabaseUrl;
    if (!scope) throw Error('Ambiente de sincronização não identificado.');
    if (service && activeScope === scope) return service;
    activeScope=scope;
    const key='dy_sync_token:'+scope;
    token=localStorage.getItem(key);
    if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem(key,token);}
    service=createSharedWorkSync({
      read:()=>record(scope),write:data=>record(scope,data,true),
      backup:(flow,id,data)=>record(scope+':backup:'+flow+':'+id+':'+Date.now(),data,true),
      legacy,uuid:()=>crypto.randomUUID(),online:()=>navigator.onLine,
      deviceId:()=>getOrCreateDeviceId(),changed:()=>paint(),
      rpc:async(name,args)=>{
        const {data,error}=await client().rpc(name,{...args,p_token:token}).abortSignal(AbortSignal.timeout(20000));
        if(error)throw error;return data;
      }
    });
    return service;
  }
  function schedule() { clearTimeout(timer);timer=setTimeout(()=>refresh(),900); }
  async function refresh(force=false) {
    if(!localStorage.getItem('currentUser'))return;
    if(!force&&Date.now()-lastRefresh<10000)return;
    lastRefresh=Date.now();
    try { await getService().refresh(); paint(); updateLists(); } catch(error){showToast(error.message,'warning');}
  }
  function relevant() {return document.querySelector('.menu-screen,.entrada-nf-screen,.romaneio-screen');}
  function paint() {
    document.getElementById('shared-work-status')?.remove();
    const connection=document.querySelector('.fab-connectivity-status');
    if(!connection||!localStorage.getItem('currentUser'))return;
    let button=document.getElementById('shared-work-icon');
    if(!button){
      button=document.createElement('button');button.id='shared-work-icon';
      button.className='fab-icon-btn shared-work-icon';button.type='button';
      connection.after(button);
      button.onclick=async()=>{
        if(!service?.status().approved){await authorize();return;}
        await refresh(true);
        const current=service.status();
        if(current.conflicts.length){await reviewConflicts();return;}
        showToast(current.error||(!navigator.onLine?'Sem conexão. Os registros serão enviados quando a internet voltar.':current.pending?'Há registros aguardando envio.':'Entradas e romaneios sincronizados.'),current.error||current.pending||!navigator.onLine?'warning':'success');
      };
    }
    const status=service?.status()||{ready:false,running:false,approved:false,pending:0,conflicts:[]};
    const count=Math.max(status.pending,status.conflicts.length);
    const label=!status.ready?'Preparando sincronização':status.running?'Sincronizando entradas e romaneios':!status.approved?'Autorizar este aparelho com o PIN':status.conflicts.length?'Revisar conflitos de sincronização':status.error||(!navigator.onLine?'Sem conexão. Sincronização pendente':count?count+' registro(s) pendente(s). Sincronizar agora':'Sincronizar entradas e romaneios');
    button.title=label;button.setAttribute('aria-label',label);
    button.disabled=status.running||!status.ready;
    button.dataset.state=status.running?'syncing':!status.approved?'unauthorized':count||status.error||!navigator.onLine?'attention':'synced';
    button.setAttribute('aria-busy',String(status.running));
    const glyph=status.approved?'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 17.9 17"/>':'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>';
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+glyph+'</svg>'+(count?'<span class="shared-work-count" aria-hidden="true">'+(count>9?'9+':count)+'</span>':'');
  }
  function updateLists() {
    // Nunca redesenha o formulário que o operador está preenchendo.
    const typing = document.activeElement?.matches('input,textarea,select');
    if(document.querySelector('.entrada-nf-drafts-screen') && !typing)renderEntradaNFRascunhosList(true);
    if(!typing && document.querySelector('.romaneio-screen')) {
      const panels = document.querySelectorAll('.romaneio-completed-list,.romaneio-monthly-sheet');
      if(panels.length){const anchor=document.createElement('div');panels[0].before(anchor);panels.forEach(p=>p.remove());anchor.outerHTML=renderRomaneiosCompletedList(service.list('romaneio').sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)));}
    }
    if(typeof updateMenuStatusUI==='function'&&document.querySelector('.menu-screen')){
      document.querySelectorAll('[data-shared-nf-count]').forEach(el=>{const count=service.list('nf').length;el.textContent=String(count);el.hidden=count===0;el.setAttribute('aria-label',count+' notas fiscais pendentes');el.closest('button')?.classList.toggle('has-pending',count>0);});
    }
  }
  async function authorize(){
    const pin=await showAppPrompt({title:'Autorizar sincronização',message:'Informe o PIN mestre para autorizar o compartilhamento neste aparelho.',label:'PIN mestre',inputType:'password',confirmLabel:'Autorizar',cancelLabel:'Cancelar'});
    if(!pin)return;
    try{await getService().authorize(localStorage.getItem('currentUser')||'',String(pin).trim());paint();updateLists();}catch(error){showToast(error.message,'warning');}
  }
  async function reviewConflicts(){
    for(const {flow,id}of service.status().conflicts){
      const local=service.localCopy(flow,id);
      const exportCopy=await showAppConfirm({title:'Registro alterado em outro aparelho',message:`${flow==='nf'?'NF':'Romaneio'} ${flow==='nf'?local?.numero_nf||id:id}`,detail:'Sua edição local não será enviada por cima da outra. Baixe sua cópia para comparar; depois você poderá usar a versão compartilhada.',confirmLabel:'Baixar minha cópia',cancelLabel:'Manter pendência'});
      if(!exportCopy)continue;
      const url=URL.createObjectURL(new Blob([JSON.stringify(local,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`copia-${flow}-${id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      if(await showAppConfirm({title:'Usar versão compartilhada?',message:'A cópia local também ficará preservada neste aparelho.',confirmLabel:'Usar compartilhada',cancelLabel:'Continuar comparando'})){
        try{await service.useRemote(flow,id);updateLists();if(flow==='nf'&&document.querySelector('.nf-form-screen'))await resumeEntradaNFXMLDraft(id);}catch(error){showToast(error.message,'warning');}
      }
    }
  }
  root.SharedWork={
    list:(flow)=>service?.ready()&&activeScope===root.supabaseClient?.supabaseUrl?service.list(flow):null,
    importLegacy:async(flow,id,data)=>{await getService().importLegacy(flow,String(id),data);schedule();},
    capture:async(flow,id,data,status)=>{try{await getService().capture(flow,String(id),data,status);schedule();}catch(error){showToast(error.message,'warning');throw error;}},
    refresh, paint, detail:(flow,id)=>getService().detail(flow,String(id)),
    ensureSynced:(flow,id)=>getService().ensureSynced(flow,String(id)),
    beginEdit:(flow,id)=>getService().beginEdit(flow,String(id)),
    status:()=>service?.status(),authorize
  };
  const appNode=document.getElementById('app');
  if(appNode)new MutationObserver(()=>{
    if(!document.querySelector('.nf-form-screen'))service?.endEdit();
    paint();if(relevant())refresh();
  }).observe(appNode,{childList:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  root.addEventListener('offline',()=>paint());root.addEventListener('online',()=>refresh(true));root.addEventListener('focus',()=>refresh());
  setInterval(()=>{if(!document.hidden&&relevant())refresh();},30000);
})(typeof window==='undefined'?globalThis:window);
