import path from 'path';
import { defineConfig, loadEnv } from 'vite';

const HOMOLOGATION_PROJECT_REF = 'doklsgduslimidfbyngj';
const HOMOLOGATION_SUPABASE_URL = `https://${HOMOLOGATION_PROJECT_REF}.supabase.co`;
const REQUIRED_ENV_VARS = [
  'VITE_APP_ENV',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const;

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('VITE_SUPABASE_ANON_KEY deve ser uma chave anon JWT valida.');

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('VITE_SUPABASE_ANON_KEY possui payload JWT invalido.');
  }
}

function validateEnvironment(mode: string) {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const missing = REQUIRED_ENV_VARS.filter(name => !String(env[name] || '').trim());
  if (missing.length) {
    throw new Error(`Configuracao obrigatoria ausente: ${missing.join(', ')}.`);
  }

  const appEnvironment = env.VITE_APP_ENV.trim().toLowerCase();
  if (!['homologation', 'homologacao'].includes(appEnvironment)) {
    throw new Error('VITE_APP_ENV invalido. Este repositorio aceita somente o ambiente de homologacao.');
  }

  let supabaseUrl: URL;
  try {
    supabaseUrl = new URL(env.VITE_SUPABASE_URL.trim());
  } catch {
    throw new Error('VITE_SUPABASE_URL deve ser uma URL valida.');
  }

  if (supabaseUrl.href !== `${HOMOLOGATION_SUPABASE_URL}/`) {
    throw new Error(`VITE_SUPABASE_URL deve apontar exclusivamente para ${HOMOLOGATION_PROJECT_REF}.`);
  }

  const keyPayload = decodeJwtPayload(env.VITE_SUPABASE_ANON_KEY.trim());
  if (keyPayload.ref !== HOMOLOGATION_PROJECT_REF || keyPayload.role !== 'anon') {
    throw new Error('VITE_SUPABASE_ANON_KEY nao pertence ao projeto de homologacao ou nao possui o papel anon.');
  }
}

export default defineConfig(({ mode }) => {
  validateEnvironment(mode);

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
