import { test, expect } from '@playwright/test';

interface ModuleTestCase {
  name: string;
  triggerLocator: (page: any) => any;
  screenLocator: string;
}

const safeModules: ModuleTestCase[] = [
  {
    name: 'PRODUTOS',
    triggerLocator: page => page.getByRole('button', { name: 'PRODUTOS', exact: true }),
    screenLocator: '.module-top-bar[data-ds-module="produtos"], .product-submenu-screen',
  },
  {
    name: 'DASHBOARD',
    triggerLocator: page => page.getByRole('button', { name: 'DASHBOARD', exact: true }),
    screenLocator: '.module-top-bar[data-ds-module="dashboard"], .operations-dashboard-screen',
  },
  {
    name: 'MOVIMENTACOES',
    triggerLocator: page => page.getByRole('button', { name: 'MOVIMENTACOES', exact: true }),
    screenLocator: '.module-top-bar[data-ds-module="movimentos"], .movimentos-screen',
  },
  {
    name: 'INVENTÁRIO',
    triggerLocator: page => page.getByRole('button', { name: 'INVENTÁRIO', exact: true }),
    screenLocator: '.module-top-bar[data-ds-module="inventario"], .inventario-submenu-screen',
  },
  {
    name: 'ENTRADA NF',
    triggerLocator: page => page.getByRole('button', { name: 'ENTRADA NF', exact: true }),
    screenLocator: '.module-top-bar[data-ds-module="nf"], .nf-submenu-screen',
  },
  {
    name: 'FINANCEIRO',
    triggerLocator: page => page.getByRole('button', { name: 'FINANCEIRO', exact: true }),
    screenLocator: '.module-top-bar[data-ds-module="financeiro"], .financeiro-submenu-screen',
  },
  {
    name: 'COMPRAS',
    triggerLocator: page => page.getByRole('button', { name: 'COMPRAS', exact: true }),
    screenLocator: '.module-top-bar[data-ds-module="compras"], .compras-submenu-screen',
  },
  {
    name: 'ANÚNCIOS',
    triggerLocator: page => page.getByRole('button', { name: 'ANÚNCIOS', exact: true }),
    screenLocator: '.module-top-bar[data-ds-module="anuncios"], .an-screen',
  },
  {
    name: 'PEDIDOS',
    triggerLocator: page => page.getByRole('button', { name: 'PEDIDOS', exact: true }),
    screenLocator: '.kit-premium-state, h2:has-text("Pedidos")',
  },
  {
    name: 'CONFERÊNCIA (PACK)',
    triggerLocator: page => page.getByRole('button', { name: 'CONFERÊNCIA (PACK)', exact: true }),
    screenLocator: '.module-top-bar[data-ds-module="pack"], .pack-screen',
  },
  {
    name: 'CONFIGURAÇÕES',
    triggerLocator: page => page.locator('button.fab-config'),
    screenLocator: '.module-top-bar[data-ds-module="configuracoes"], .config-screen',
  },
];

test.describe('Navegação parametrizada dos módulos seguros da tela inicial', () => {
  for (const moduleInfo of safeModules) {
    test(`Módulo ${moduleInfo.name} - abrir, validar e voltar`, async ({ page }) => {
      // Ajustar timeout individual para comportar carga inicial fria de dados
      test.setTimeout(90000);

      const errors: string[] = [];

      // Capturar pageerror e falhar se ocorrer erro JavaScript
      page.on('pageerror', error => {
        errors.push(error.message);
      });

      // 1. Acessar /
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // Aguardar o carregamento inicial da aplicação sair do splash screen
      const loginOrMenu = page.locator('.user-card, .menu-screen, .menu-grid').first();
      await loginOrMenu.waitFor({ state: 'visible', timeout: 25000 });

      // Se a tela de login for exibida, realiza o clique no usuário nativo da UI
      const usuarioTesteCard = page.locator('.user-card').filter({ hasText: 'Usuário Teste' }).first();
      const admCard = page.locator('.user-card').filter({ hasText: 'ADM' }).first();

      if (await usuarioTesteCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await usuarioTesteCard.click();
      } else if (await admCard.isVisible({ timeout: 2000 }).catch(() => false)) {
        await admCard.click();
      }

      // 2. Confirmar que o menu principal está visível
      const menuElement = page.locator('.menu-screen, .menu-grid').first();
      await expect(menuElement).toBeVisible({ timeout: 20000 });

      // 3. Clicar no card/botão do módulo usando seletor estável
      const moduleButton = moduleInfo.triggerLocator(page);
      await expect(moduleButton).toBeVisible();
      await moduleButton.click();

      // 4. Confirmar que a tela correspondente abriu usando seletor estável
      const openedScreen = page.locator(moduleInfo.screenLocator).first();
      await expect(openedScreen).toBeVisible({ timeout: 20000 });

      // Validação expandida exclusiva para o módulo CONFERÊNCIA (PACK)
      if (moduleInfo.name === 'CONFERÊNCIA (PACK)') {
        const fabFuncoes = page.locator('button.fab-funcoes').first();
        const confCategoryBtn = page.locator('button.quick-action-conferences').first();

        // 4a. Navegação para "Conferências de hoje" via menu de funções rápidas da UI
        if (await fabFuncoes.isVisible({ timeout: 3000 }).catch(() => false)) {
          await fabFuncoes.click();
          await expect(confCategoryBtn).toBeVisible({ timeout: 5000 });
          await confCategoryBtn.click();

          const todayBtn = page.locator('button:has-text("CONFERENCIAS DE HOJE")').first();
          await expect(todayBtn).toBeVisible({ timeout: 5000 });
          await todayBtn.click();

          const todayHeading = page.locator('h1:has-text("CONFERENCIAS DE HOJE")').first();
          await expect(todayHeading).toBeVisible({ timeout: 15000 });
        }

        // 4b. Navegação para "Histórico de conferências" ("HISTORICO COMPLETO") via menu de funções rápidas da UI
        if (await fabFuncoes.isVisible({ timeout: 3000 }).catch(() => false)) {
          await fabFuncoes.click();
          await expect(confCategoryBtn).toBeVisible({ timeout: 5000 });
          await confCategoryBtn.click();

          const historyBtn = page.locator('button:has-text("HISTORICO COMPLETO")').first();
          await expect(historyBtn).toBeVisible({ timeout: 5000 });
          await historyBtn.click();

          const historyHeading = page.locator('h1:has-text("HISTORICO COMPLETO")').first();
          await expect(historyHeading).toBeVisible({ timeout: 15000 });
        }
      }

      // Validação expandida exclusiva para o módulo ENTRADA NF
      if (moduleInfo.name === 'ENTRADA NF') {
        const nfSubmenuScreen = page.locator('.module-top-bar[data-ds-module="nf"], .nf-submenu-screen').first();
        const voltarButton = page.getByRole('button', { name: 'Voltar' }).or(page.locator('button.fab-voltar')).first();

        // 1. Subtela: RECEBER POR XML
        const receberXmlCard = page.locator('.standard-module-card:has-text("RECEBER POR XML")').first();
        await expect(receberXmlCard).toBeVisible({ timeout: 5000 });
        await receberXmlCard.click();

        const xmlScreen = page.locator('#nfxml-wizard-root, span:has-text("ENTRADA NF - XML")').first();
        await expect(xmlScreen).toBeVisible({ timeout: 15000 });

        await voltarButton.click();
        if (!(await nfSubmenuScreen.isVisible({ timeout: 2000 }).catch(() => false))) {
          const mainNfCard = moduleInfo.triggerLocator(page);
          await expect(mainNfCard).toBeVisible({ timeout: 5000 });
          await mainNfCard.click();
        }
        await expect(nfSubmenuScreen).toBeVisible({ timeout: 10000 });

        // 2. Subtela: RASCUNHOS DE NF
        const rascunhosCard = page.locator('.standard-module-card:has-text("RASCUNHOS DE NF")').first();
        await expect(rascunhosCard).toBeVisible({ timeout: 5000 });
        await rascunhosCard.click();

        const rascunhosScreen = page.locator('.entrada-nf-drafts-screen, h1:has-text("RASCUNHOS DE ENTRADA NF")').first();
        await expect(rascunhosScreen).toBeVisible({ timeout: 15000 });
        await page.waitForTimeout(500);

        await voltarButton.click();
        if (!(await nfSubmenuScreen.isVisible({ timeout: 2000 }).catch(() => false))) {
          const mainNfCard = moduleInfo.triggerLocator(page);
          await expect(mainNfCard).toBeVisible({ timeout: 5000 });
          await mainNfCard.click();
        }
        await expect(nfSubmenuScreen).toBeVisible({ timeout: 10000 });

        // 3. Subtela: NFs ABERTAS
        const abertasCard = page.locator('.standard-module-card:has-text("NFs ABERTAS")').first();
        await expect(abertasCard).toBeVisible({ timeout: 5000 });
        await abertasCard.click();

        const abertasScreen = page.locator('.nf-list-screen, div:has-text("NOTAS EM ABERTO")').first();
        await expect(abertasScreen).toBeVisible({ timeout: 15000 });
        await page.waitForTimeout(500);

        await voltarButton.click();
        if (!(await nfSubmenuScreen.isVisible({ timeout: 2000 }).catch(() => false))) {
          const mainNfCard = moduleInfo.triggerLocator(page);
          await expect(mainNfCard).toBeVisible({ timeout: 5000 });
          await mainNfCard.click();
        }
        await expect(nfSubmenuScreen).toBeVisible({ timeout: 10000 });

        // 4. Subtela: HISTORICO DE ENTRADAS
        const historicoCard = page.locator('.standard-module-card:has-text("HISTORICO DE ENTRADAS")').first();
        await expect(historicoCard).toBeVisible({ timeout: 5000 });
        await historicoCard.click();

        const historicoScreen = page.locator('#entrada-nf-history-content, .entrada-nf-history-screen').first();
        await expect(historicoScreen).toBeVisible({ timeout: 15000 });
        await page.waitForTimeout(500);

        await voltarButton.click();
        if (!(await nfSubmenuScreen.isVisible({ timeout: 2000 }).catch(() => false))) {
          const mainNfCard = moduleInfo.triggerLocator(page);
          await expect(mainNfCard).toBeVisible({ timeout: 5000 });
          await mainNfCard.click();
        }
        await expect(nfSubmenuScreen).toBeVisible({ timeout: 10000 });
      }

      // Validação expandida exclusiva para o módulo FINANCEIRO
      if (moduleInfo.name === 'FINANCEIRO') {
        const finSubmenuScreen = page.locator('.module-top-bar[data-ds-module="financeiro"], .financeiro-screen').first();
        const voltarButton = page.getByRole('button', { name: 'Voltar' }).or(page.locator('button.fab-voltar')).first();

        // 1. Subtela: A VENCER
        const aVencerCard = page.locator('.standard-module-card:has-text("A VENCER")').first();
        await expect(aVencerCard).toBeVisible({ timeout: 5000 });
        await aVencerCard.click();

        const aVencerScreen = page.locator('.financeiro-list-workspace, header.financeiro-list-header strong:has-text("A VENCER")').first();
        await expect(aVencerScreen).toBeVisible({ timeout: 15000 });

        await voltarButton.click();
        if (!(await finSubmenuScreen.isVisible({ timeout: 2000 }).catch(() => false))) {
          const mainFinCard = moduleInfo.triggerLocator(page);
          await expect(mainFinCard).toBeVisible({ timeout: 5000 });
          await mainFinCard.click();
        }
        await expect(finSubmenuScreen).toBeVisible({ timeout: 10000 });

        // 2. Subtela: VENCIDAS
        const vencidasCard = page.locator('.standard-module-card:has-text("VENCIDAS")').first();
        await expect(vencidasCard).toBeVisible({ timeout: 5000 });
        await vencidasCard.click();

        const vencidasScreen = page.locator('.financeiro-list-workspace, header.financeiro-list-header strong:has-text("VENCIDAS")').first();
        await expect(vencidasScreen).toBeVisible({ timeout: 15000 });

        await voltarButton.click();
        if (!(await finSubmenuScreen.isVisible({ timeout: 2000 }).catch(() => false))) {
          const mainFinCard = moduleInfo.triggerLocator(page);
          await expect(mainFinCard).toBeVisible({ timeout: 5000 });
          await mainFinCard.click();
        }
        await expect(finSubmenuScreen).toBeVisible({ timeout: 10000 });

        // 3. Subtela: PENDENTES
        const pendentesCard = page.locator('.standard-module-card:has-text("PENDENTES")').first();
        await expect(pendentesCard).toBeVisible({ timeout: 5000 });
        await pendentesCard.click();

        const pendentesScreen = page.locator('.financeiro-list-workspace, header.financeiro-list-header strong:has-text("PENDENTES")').first();
        await expect(pendentesScreen).toBeVisible({ timeout: 15000 });

        await voltarButton.click();
        if (!(await finSubmenuScreen.isVisible({ timeout: 2000 }).catch(() => false))) {
          const mainFinCard = moduleInfo.triggerLocator(page);
          await expect(mainFinCard).toBeVisible({ timeout: 5000 });
          await mainFinCard.click();
        }
        await expect(finSubmenuScreen).toBeVisible({ timeout: 10000 });

        // 4. Subtela: A COMBINAR
        const aCombinarCard = page.locator('.standard-module-card:has-text("A COMBINAR")').first();
        await expect(aCombinarCard).toBeVisible({ timeout: 5000 });
        await aCombinarCard.click();

        const aCombinarScreen = page.locator('.financeiro-list-workspace, strong:has-text("NOTAS COM PAGAMENTO A COMBINAR")').first();
        await expect(aCombinarScreen).toBeVisible({ timeout: 15000 });

        await voltarButton.click();
        if (!(await finSubmenuScreen.isVisible({ timeout: 2000 }).catch(() => false))) {
          const mainFinCard = moduleInfo.triggerLocator(page);
          await expect(mainFinCard).toBeVisible({ timeout: 5000 });
          await mainFinCard.click();
        }
        await expect(finSubmenuScreen).toBeVisible({ timeout: 10000 });

        // 5. Subtela: PAGAS NO MES
        const pagasMesCard = page.locator('.standard-module-card:has-text("PAGAS NO MES")').first();
        await expect(pagasMesCard).toBeVisible({ timeout: 5000 });
        await pagasMesCard.click();

        const pagasMesScreen = page.locator('.financeiro-list-workspace').first();
        await expect(pagasMesScreen).toBeVisible({ timeout: 15000 });

        await voltarButton.click();
        if (!(await finSubmenuScreen.isVisible({ timeout: 2000 }).catch(() => false))) {
          const mainFinCard = moduleInfo.triggerLocator(page);
          await expect(mainFinCard).toBeVisible({ timeout: 5000 });
          await mainFinCard.click();
        }
        await expect(finSubmenuScreen).toBeVisible({ timeout: 10000 });
      }

      // 5. Sem ações internas operacionais -> 6. Clicar somente no botão Voltar para retornar ao menu principal
      const finalVoltarButton = page.getByRole('button', { name: 'Voltar' }).or(page.locator('button.fab-voltar')).first();
      await expect(finalVoltarButton).toBeVisible();
      await finalVoltarButton.click();

      // 7. Confirmar que o menu principal reapareceu
      await expect(menuElement).toBeVisible();

      // 8. Validar se nenhum erro de JavaScript ocorreu no fluxo
      expect(errors).toEqual([]);
    });
  }
});
