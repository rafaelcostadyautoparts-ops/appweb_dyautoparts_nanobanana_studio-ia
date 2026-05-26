


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."canais_envio" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canal_id" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "tipo" "text",
    "ativo" boolean,
    "criado_em" timestamp without time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp without time zone
);


ALTER TABLE "public"."canais_envio" OWNER TO "postgres";


COMMENT ON TABLE "public"."canais_envio" IS 'Tabela responsável pelo armazenamento dos canais e métodos de envio utilizados para entrega de pedidos';



CREATE TABLE IF NOT EXISTS "public"."conferencia" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conferencia_id" "text" NOT NULL,
    "separacao_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "conferido_por" "text" NOT NULL,
    "conferido_em" timestamp without time zone,
    "atualizado_em" timestamp without time zone
);


ALTER TABLE "public"."conferencia" OWNER TO "postgres";


COMMENT ON TABLE "public"."conferencia" IS 'Tabela responsável pela conferência dos itens separados, garantindo a validação das quantidades, identificação de divergências e liberação para baixa no estoque e expedição';



CREATE TABLE IF NOT EXISTS "public"."conferencia_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conferencia_id" "text" NOT NULL,
    "separacao_id" "text",
    "id_interno" "text" NOT NULL,
    "ean" "text",
    "descricao" "text",
    "qtd_separada" integer,
    "qtd_conferida" integer,
    "divergencia" "text"
);


ALTER TABLE "public"."conferencia_itens" OWNER TO "postgres";


COMMENT ON TABLE "public"."conferencia_itens" IS 'Tabela responsável pelo detalhamento dos itens no processo de conferência, permitindo a validação das quantidades separadas em relação às conferidas';



CREATE TABLE IF NOT EXISTS "public"."entradas_nf" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero_nf" "text",
    "chave_acesso" "text",
    "serie" "text",
    "data_emissao" "date",
    "data_recebimento" "date",
    "cnpj_fornecedor" "text",
    "fornecedor_nome" "text",
    "valor_total" numeric(12,2) DEFAULT 0,
    "origem" "text" DEFAULT 'manual'::"text",
    "status" "text" DEFAULT 'rascunho'::"text",
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."entradas_nf" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entradas_nf_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nf_id" "uuid" NOT NULL,
    "produto_id_interno" "text",
    "ean_xml" "text",
    "descricao_xml" "text",
    "quantidade" numeric(12,3) DEFAULT 0,
    "valor_unitario" numeric(12,2) DEFAULT 0,
    "valor_total" numeric(12,2) DEFAULT 0,
    "status_vinculo" "text" DEFAULT 'pendente_vinculo'::"text",
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."entradas_nf_itens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."estoque_atual" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_interno" "text" NOT NULL,
    "local" "text" NOT NULL,
    "saldo_disponivel" integer,
    "saldo_reservado" integer,
    "saldo_em_transito" integer,
    "saldo_total" integer,
    "atualizado_em" timestamp without time zone,
    "chave_estoque" "text"
);


ALTER TABLE "public"."estoque_atual" OWNER TO "postgres";


COMMENT ON TABLE "public"."estoque_atual" IS 'Tabela responsável pelo controle de estoque atual dos produtos, incluindo saldos disponíveis, reservados, em trânsito e total por localização';



CREATE TABLE IF NOT EXISTS "public"."financeiro_pagar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nf_id" "uuid",
    "numero_nf" "text",
    "cnpj_fornecedor" "text",
    "fornecedor_nome" "text",
    "valor" numeric(12,2) DEFAULT 0,
    "parcela" "text",
    "total_parcelas" integer DEFAULT 1,
    "numero_parcela" integer DEFAULT 1,
    "data_recebimento" "date",
    "data_vencimento" "date",
    "data_pagamento" "date",
    "mes" integer,
    "ano" integer,
    "status_recebimento" "text" DEFAULT 'recebido'::"text",
    "status_vencimento" "text" DEFAULT 'em_aberto'::"text",
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."financeiro_pagar" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."garantias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garantia_id" "text",
    "data_envio" timestamp without time zone DEFAULT "now"(),
    "id_interno" "text" NOT NULL,
    "descricao_produto" "text",
    "fornecedor" "text",
    "tipo_operacao" "text",
    "motivo" "text",
    "observacao" "text",
    "origem_estoque" "text",
    "quantidade" numeric(12,3) DEFAULT 0,
    "custo_unitario" numeric(12,2) DEFAULT 0,
    "custo_total" numeric(12,2) DEFAULT 0,
    "status" "text" DEFAULT 'ENVIADO'::"text",
    "usuario" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."garantias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventario_id" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "filtro_aplicado" "text",
    "status" "text" NOT NULL,
    "criado_por" "text" NOT NULL,
    "criado_em" timestamp without time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp without time zone,
    "data_inicio" timestamp without time zone,
    "data_fim" timestamp without time zone,
    "total_skus" integer,
    "total_itens_contados" integer,
    "total_divergencias" integer,
    "valor_ajuste_positivo" numeric,
    "valor_ajuste_negativo" numeric,
    "observacao" "text",
    "usuario_responsavel" "text",
    "local" "text",
    "total_itens" integer DEFAULT 0
);


ALTER TABLE "public"."inventarios" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventarios" IS 'Tabela responsável pelo gerenciamento de inventários de estoque, incluindo contagens físicas, identificação de divergências e registro de ajustes positivos e negativos';



CREATE TABLE IF NOT EXISTS "public"."inventarios_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventario_id" "text" NOT NULL,
    "id_interno" "text" NOT NULL,
    "local" "text" NOT NULL,
    "saldo_sistema" integer,
    "saldo_fisico" integer,
    "diferenca" integer,
    "valor_unitario" numeric,
    "valor_diferenca" numeric,
    "auditado_por" "text",
    "auditado_em" timestamp without time zone,
    "atualizado_em" timestamp without time zone
);


ALTER TABLE "public"."inventarios_itens" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventarios_itens" IS 'Tabela responsável pelo detalhamento dos itens inventariados, permitindo a comparação entre o saldo registrado no sistema e o saldo físico, com apuração de divergências e impactos financeiros';



CREATE TABLE IF NOT EXISTS "public"."kit_lampada" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kit_lampada_id" "text",
    "montadora" "text",
    "modelo" "text",
    "ano_inicio" integer,
    "ano_fim" integer,
    "lampada_baixo" "text",
    "lampada_alto" "text",
    "lampada_neblina" "text",
    "url" "text",
    "observacao" "text",
    "status" "text" DEFAULT 'revisar'::"text"
);


ALTER TABLE "public"."kit_lampada" OWNER TO "postgres";


COMMENT ON TABLE "public"."kit_lampada" IS 'Tabela destinada à consulta de kits de lâmpadas, contendo a composição de lâmpadas por veículo ou aplicação';



CREATE TABLE IF NOT EXISTS "public"."movimentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "movimento_id" "text" NOT NULL,
    "data_hora" timestamp without time zone NOT NULL,
    "tipo" "text" NOT NULL,
    "id_interno" "text" NOT NULL,
    "local_origem" "text",
    "local_destino" "text",
    "quantidade" integer NOT NULL,
    "usuario" "text",
    "origem" "text",
    "observacao" "text"
);


ALTER TABLE "public"."movimentos" OWNER TO "postgres";


COMMENT ON TABLE "public"."movimentos" IS 'Tabela responsável pelo registro de todas as movimentações de estoque (entradas, saídas e transferências), garantindo o controle e a rastreabilidade dos saldos dos produtos';



CREATE TABLE IF NOT EXISTS "public"."produtos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_interno" "text" NOT NULL,
    "ean" "text" NOT NULL,
    "sku_fornecedor" "text" NOT NULL,
    "descricao_base" "text" NOT NULL,
    "marca" "text" NOT NULL,
    "cor" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "subcategoria" "text" NOT NULL,
    "unidade" "text" NOT NULL,
    "preco_custo" numeric NOT NULL,
    "preco_varejo" numeric NOT NULL,
    "preco_atacado" numeric NOT NULL,
    "estoque_minimo" integer NOT NULL,
    "qtd_minima_atacado" integer NOT NULL,
    "status" "text" NOT NULL,
    "observacoes" "text" NOT NULL,
    "url_imagem" "text" NOT NULL,
    "url_pdf_manual" "text" NOT NULL,
    "descricao_completa" "text" NOT NULL,
    "atributos" "jsonb" NOT NULL,
    "criado_em" timestamp without time zone DEFAULT "now"(),
    "atualizado_em" timestamp without time zone,
    "quantidade_embalagem" integer DEFAULT 1
);


ALTER TABLE "public"."produtos" OWNER TO "postgres";


COMMENT ON TABLE "public"."produtos" IS 'Tabela responsável pelo armazenamento dos dados dos produtos disponíveis no sistema';



CREATE TABLE IF NOT EXISTS "public"."separacao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "separacao_id" "text" NOT NULL,
    "pedido_referencia" "text",
    "canal_id" "text" NOT NULL,
    "canal_nome" "text",
    "status" "text" NOT NULL,
    "criado_por" "text" NOT NULL,
    "criado_em" timestamp without time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp without time zone,
    "finalizado_em" timestamp without time zone,
    "observacao" "text"
);


ALTER TABLE "public"."separacao" OWNER TO "postgres";


COMMENT ON TABLE "public"."separacao" IS 'Tabela responsável pelo controle do processo de separação de pedidos, incluindo canal de envio, status e rastreamento das atividades de picking';



CREATE TABLE IF NOT EXISTS "public"."separacao_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "separacao_id" "text" NOT NULL,
    "id_interno" "text" NOT NULL,
    "ean" "text",
    "descricao" "text",
    "qtd_solicitada" integer NOT NULL,
    "qtd_separada" integer,
    "atualizado_em" timestamp without time zone
);


ALTER TABLE "public"."separacao_itens" OWNER TO "postgres";


COMMENT ON TABLE "public"."separacao_itens" IS 'Tabela responsável pelo detalhamento dos itens em processo de separação de pedidos, contendo quantidades solicitadas, separadas e informações para conferência e bipagem';



CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "perfil" "text",
    "ativo" boolean,
    "criado_em" timestamp without time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp without time zone
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


COMMENT ON TABLE "public"."usuarios" IS 'Tabela responsável pelo armazenamento das informações dos usuários e seus níveis de acesso no sistema';



ALTER TABLE ONLY "public"."canais_envio"
    ADD CONSTRAINT "canais_envio_canal_id_key" UNIQUE ("canal_id");



ALTER TABLE ONLY "public"."canais_envio"
    ADD CONSTRAINT "canais_envio_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conferencia"
    ADD CONSTRAINT "conferencia_conferencia_id_key" UNIQUE ("conferencia_id");



ALTER TABLE ONLY "public"."conferencia_itens"
    ADD CONSTRAINT "conferencia_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conferencia"
    ADD CONSTRAINT "conferencia_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entradas_nf_itens"
    ADD CONSTRAINT "entradas_nf_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entradas_nf"
    ADD CONSTRAINT "entradas_nf_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."estoque_atual"
    ADD CONSTRAINT "estoque_atual_chave_estoque_key" UNIQUE ("chave_estoque");



ALTER TABLE ONLY "public"."estoque_atual"
    ADD CONSTRAINT "estoque_atual_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financeiro_pagar"
    ADD CONSTRAINT "financeiro_pagar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."garantias"
    ADD CONSTRAINT "garantias_garantia_id_key" UNIQUE ("garantia_id");



ALTER TABLE ONLY "public"."garantias"
    ADD CONSTRAINT "garantias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventarios"
    ADD CONSTRAINT "inventarios_inventario_id_key" UNIQUE ("inventario_id");



ALTER TABLE ONLY "public"."inventarios_itens"
    ADD CONSTRAINT "inventarios_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventarios"
    ADD CONSTRAINT "inventarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kit_lampada"
    ADD CONSTRAINT "kit_lampada_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movimentos"
    ADD CONSTRAINT "movimentos_movimento_id_key" UNIQUE ("movimento_id");



ALTER TABLE ONLY "public"."movimentos"
    ADD CONSTRAINT "movimentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_id_interno_key" UNIQUE ("id_interno");



ALTER TABLE ONLY "public"."produtos"
    ADD CONSTRAINT "produtos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."separacao_itens"
    ADD CONSTRAINT "separacao_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."separacao"
    ADD CONSTRAINT "separacao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."separacao"
    ADD CONSTRAINT "separacao_separacao_id_key" UNIQUE ("separacao_id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_usuario_id_key" UNIQUE ("usuario_id");



CREATE INDEX "idx_entradas_nf_cnpj" ON "public"."entradas_nf" USING "btree" ("cnpj_fornecedor");



CREATE INDEX "idx_entradas_nf_itens_nf_id" ON "public"."entradas_nf_itens" USING "btree" ("nf_id");



CREATE INDEX "idx_entradas_nf_itens_produto" ON "public"."entradas_nf_itens" USING "btree" ("produto_id_interno");



CREATE INDEX "idx_entradas_nf_numero_nf" ON "public"."entradas_nf" USING "btree" ("numero_nf");



CREATE INDEX "idx_entradas_nf_status" ON "public"."entradas_nf" USING "btree" ("status");



CREATE INDEX "idx_financeiro_pagar_nf_id" ON "public"."financeiro_pagar" USING "btree" ("nf_id");



CREATE INDEX "idx_financeiro_pagar_status" ON "public"."financeiro_pagar" USING "btree" ("status_vencimento");



CREATE INDEX "idx_financeiro_pagar_vencimento" ON "public"."financeiro_pagar" USING "btree" ("data_vencimento");



CREATE INDEX "idx_garantias_data_envio" ON "public"."garantias" USING "btree" ("data_envio");



CREATE INDEX "idx_garantias_id_interno" ON "public"."garantias" USING "btree" ("id_interno");



CREATE INDEX "idx_garantias_status" ON "public"."garantias" USING "btree" ("status");



CREATE INDEX "idx_kit_lampada_busca" ON "public"."kit_lampada" USING "btree" ("montadora", "modelo", "ano_inicio", "ano_fim");



CREATE OR REPLACE TRIGGER "update_entradas_nf_itens_updated_at" BEFORE UPDATE ON "public"."entradas_nf_itens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_entradas_nf_updated_at" BEFORE UPDATE ON "public"."entradas_nf" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_financeiro_pagar_updated_at" BEFORE UPDATE ON "public"."financeiro_pagar" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."entradas_nf_itens"
    ADD CONSTRAINT "entradas_nf_itens_nf_id_fkey" FOREIGN KEY ("nf_id") REFERENCES "public"."entradas_nf"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financeiro_pagar"
    ADD CONSTRAINT "financeiro_pagar_nf_id_fkey" FOREIGN KEY ("nf_id") REFERENCES "public"."entradas_nf"("id") ON DELETE SET NULL;



CREATE POLICY "allow public read kit_lampada" ON "public"."kit_lampada" FOR SELECT USING (true);



CREATE POLICY "allow_insert" ON "public"."estoque_atual" FOR INSERT WITH CHECK (true);



CREATE POLICY "allow_insert" ON "public"."inventarios" FOR INSERT WITH CHECK (true);



CREATE POLICY "allow_insert" ON "public"."inventarios_itens" FOR INSERT WITH CHECK (true);



CREATE POLICY "allow_insert" ON "public"."movimentos" FOR INSERT WITH CHECK (true);



CREATE POLICY "allow_insert" ON "public"."produtos" FOR INSERT WITH CHECK (true);



CREATE POLICY "allow_select" ON "public"."estoque_atual" FOR SELECT USING (true);



CREATE POLICY "allow_select" ON "public"."inventarios" FOR SELECT USING (true);



CREATE POLICY "allow_select" ON "public"."inventarios_itens" FOR SELECT USING (true);



CREATE POLICY "allow_select" ON "public"."movimentos" FOR SELECT USING (true);



CREATE POLICY "allow_select" ON "public"."produtos" FOR SELECT USING (true);



CREATE POLICY "allow_update" ON "public"."estoque_atual" FOR UPDATE USING (true);



CREATE POLICY "allow_update" ON "public"."inventarios" FOR UPDATE USING (true);



CREATE POLICY "allow_update" ON "public"."inventarios_itens" FOR UPDATE USING (true);



CREATE POLICY "allow_update" ON "public"."movimentos" FOR UPDATE USING (true);



CREATE POLICY "allow_update" ON "public"."produtos" FOR UPDATE USING (true);



ALTER TABLE "public"."canais_envio" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conferencia" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conferencia_itens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entradas_nf" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entradas_nf_itens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."estoque_atual" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financeiro_pagar" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."garantias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventarios_itens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kit_lampada" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movimentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permitir_insert_entradas_nf" ON "public"."entradas_nf" FOR INSERT WITH CHECK (true);



CREATE POLICY "permitir_insert_entradas_nf_itens" ON "public"."entradas_nf_itens" FOR INSERT WITH CHECK (true);



CREATE POLICY "permitir_insert_financeiro_pagar" ON "public"."financeiro_pagar" FOR INSERT WITH CHECK (true);



CREATE POLICY "permitir_insert_garantias" ON "public"."garantias" FOR INSERT WITH CHECK (true);



CREATE POLICY "permitir_select_entradas_nf" ON "public"."entradas_nf" FOR SELECT USING (true);



CREATE POLICY "permitir_select_entradas_nf_itens" ON "public"."entradas_nf_itens" FOR SELECT USING (true);



CREATE POLICY "permitir_select_financeiro_pagar" ON "public"."financeiro_pagar" FOR SELECT USING (true);



CREATE POLICY "permitir_select_garantias" ON "public"."garantias" FOR SELECT USING (true);



CREATE POLICY "permitir_update_entradas_nf" ON "public"."entradas_nf" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "permitir_update_entradas_nf_itens" ON "public"."entradas_nf_itens" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "permitir_update_financeiro_pagar" ON "public"."financeiro_pagar" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "permitir_update_garantias" ON "public"."garantias" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."produtos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."separacao" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."separacao_itens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."canais_envio" TO "anon";
GRANT ALL ON TABLE "public"."canais_envio" TO "authenticated";
GRANT ALL ON TABLE "public"."canais_envio" TO "service_role";



GRANT ALL ON TABLE "public"."conferencia" TO "anon";
GRANT ALL ON TABLE "public"."conferencia" TO "authenticated";
GRANT ALL ON TABLE "public"."conferencia" TO "service_role";



GRANT ALL ON TABLE "public"."conferencia_itens" TO "anon";
GRANT ALL ON TABLE "public"."conferencia_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."conferencia_itens" TO "service_role";



GRANT ALL ON TABLE "public"."entradas_nf" TO "anon";
GRANT ALL ON TABLE "public"."entradas_nf" TO "authenticated";
GRANT ALL ON TABLE "public"."entradas_nf" TO "service_role";



GRANT ALL ON TABLE "public"."entradas_nf_itens" TO "anon";
GRANT ALL ON TABLE "public"."entradas_nf_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."entradas_nf_itens" TO "service_role";



GRANT ALL ON TABLE "public"."estoque_atual" TO "anon";
GRANT ALL ON TABLE "public"."estoque_atual" TO "authenticated";
GRANT ALL ON TABLE "public"."estoque_atual" TO "service_role";



GRANT ALL ON TABLE "public"."financeiro_pagar" TO "anon";
GRANT ALL ON TABLE "public"."financeiro_pagar" TO "authenticated";
GRANT ALL ON TABLE "public"."financeiro_pagar" TO "service_role";



GRANT ALL ON TABLE "public"."garantias" TO "anon";
GRANT ALL ON TABLE "public"."garantias" TO "authenticated";
GRANT ALL ON TABLE "public"."garantias" TO "service_role";



GRANT ALL ON TABLE "public"."inventarios" TO "anon";
GRANT ALL ON TABLE "public"."inventarios" TO "authenticated";
GRANT ALL ON TABLE "public"."inventarios" TO "service_role";



GRANT ALL ON TABLE "public"."inventarios_itens" TO "anon";
GRANT ALL ON TABLE "public"."inventarios_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."inventarios_itens" TO "service_role";



GRANT ALL ON TABLE "public"."kit_lampada" TO "anon";
GRANT ALL ON TABLE "public"."kit_lampada" TO "authenticated";
GRANT ALL ON TABLE "public"."kit_lampada" TO "service_role";



GRANT ALL ON TABLE "public"."movimentos" TO "anon";
GRANT ALL ON TABLE "public"."movimentos" TO "authenticated";
GRANT ALL ON TABLE "public"."movimentos" TO "service_role";



GRANT ALL ON TABLE "public"."produtos" TO "anon";
GRANT ALL ON TABLE "public"."produtos" TO "authenticated";
GRANT ALL ON TABLE "public"."produtos" TO "service_role";



GRANT ALL ON TABLE "public"."separacao" TO "anon";
GRANT ALL ON TABLE "public"."separacao" TO "authenticated";
GRANT ALL ON TABLE "public"."separacao" TO "service_role";



GRANT ALL ON TABLE "public"."separacao_itens" TO "anon";
GRANT ALL ON TABLE "public"."separacao_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."separacao_itens" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";


