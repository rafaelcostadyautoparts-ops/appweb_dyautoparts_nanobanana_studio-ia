-- Executar SOMENTE no projeto de homologação doklsgduslimidfbyngj.
-- Todos os registros de teste são revertidos. Não há movimento de estoque.
begin;
insert into public.dispositivos_autorizados(device_id,nome_usuario,ativo,status)
values ('teste-sync-A','Teste',true,'aprovado'),('teste-sync-B','Teste',true,'aprovado');
set local role anon;
select public.registrar_sessao_operacional('teste-sync-A',repeat('a',64));
select public.registrar_sessao_operacional('teste-sync-B',repeat('b',64));
do $$ begin
 begin perform public.listar_registros_operacionais(repeat('a',64),'nf'); raise exception 'Sessão pendente acessou dados';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Apenas fixture: a aprovação real exige o PIN mestre pela RPC existente.
update operacional_sync.sessoes set aprovado=true where device_id in ('teste-sync-A','teste-sync-B');
set local role anon;
do $$ declare a jsonb; b jsonb; op uuid:=gen_random_uuid(); begin
 a:=public.salvar_registro_operacional(repeat('a',64),'nf',repeat('9',44),jsonb_build_object('currentStep','produtos'),0,op,'ativo');
 assert (a->>'revisao')::int=1, 'Revisão inicial';
 b:=public.obter_registro_operacional(repeat('b',64),'nf',repeat('9',44));
 assert b#>>'{dados,currentStep}'='produtos', 'Continuidade em outro aparelho';
 a:=public.salvar_registro_operacional(repeat('a',64),'nf',repeat('9',44),jsonb_build_object('currentStep','produtos'),0,op,'ativo');
 assert (a->>'revisao')::int=1, 'Idempotência';
 perform public.salvar_registro_operacional(repeat('b',64),'nf',repeat('9',44),jsonb_build_object('currentStep','revisao'),1,gen_random_uuid(),'ativo');
 begin perform public.salvar_registro_operacional(repeat('a',64),'nf',repeat('9',44),'{}',1,gen_random_uuid(),'ativo'); raise exception 'Sobrescrita não bloqueada';
 exception when sqlstate 'PT409' then null; end;
 perform public.salvar_registro_operacional(repeat('b',64),'nf',repeat('9',44),'{}',2,gen_random_uuid(),'descartado');
 begin perform public.salvar_registro_operacional(repeat('a',64),'nf',repeat('9',44),'{}',3,gen_random_uuid(),'ativo'); raise exception 'Rascunho ressuscitado';
 exception when sqlstate 'PT409' then null; end;
 perform public.salvar_registro_operacional(repeat('a',64),'romaneio','TESTE-SYNC',jsonb_build_object('assinatura','data:image/png;base64,dGVzdGU=','documento','documento-ficticio'),0,gen_random_uuid(),'ativo');
 b:=public.obter_registro_operacional(repeat('b',64),'romaneio','TESTE-SYNC');
 assert b#>>'{dados,assinatura}' is not null, 'Evidência compartilhada';
 select x into b from jsonb_array_elements(public.listar_registros_operacionais(repeat('b',64),'romaneio')) x where x->>'id'='TESTE-SYNC';
 assert (b#>>'{dados,possui_assinatura}')::boolean, 'Resumo de assinatura';
 assert not (b->'dados' ? 'assinatura'), 'Lista não transporta imagem';
 begin perform public.obter_registro_operacional(repeat('c',64),'romaneio','TESTE-SYNC'); raise exception 'Credencial inválida aceita';
 exception when insufficient_privilege then null; end;
 begin perform 1 from public.entrada_nf_rascunhos; raise exception 'Acesso direto permitido';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin assert not exists(select 1 from public.romaneios_retirada where id='TESTE-SYNC' and dados ? 'assinatura'), 'Evidência fora da área privada'; end $$;
rollback;
