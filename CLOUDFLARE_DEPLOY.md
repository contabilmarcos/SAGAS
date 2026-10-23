# Publicação automática do SAGAS no Cloudflare

Este repositório contém o código do Worker em `SAGAS_worker.js` e o workflow
`.github/workflows/deploy-sagas-worker.yml`.

## Estado inicial

**Desativado por segurança.** Criar o workflow ou atualizar o Worker no GitHub
**não publica imediatamente no Cloudflare**. A implantação só é habilitada
quando a variável `SAGAS_CLOUDFLARE_AUTO_DEPLOY` tiver o valor `enabled`.

O destino configurado é o Worker existente **sagas-api**, e não um Worker novo.
O vínculo do banco de dados precisa ser **DB** e apontar para o **D1 já existente**.
Não crie outro banco nem mude o UUID para um banco diferente.

## Preparação única

1. Faça backup do Worker e do banco D1 atuais pelo Cloudflare.
2. No Cloudflare: obtenha o **Account ID** da conta onde fica `sagas-api`.
3. No Cloudflare: abra **Workers & Pages → D1**, selecione o banco D1
   usado pelo Worker `sagas-api` e copie seu **Database ID (UUID)** e **nome**.
4. Crie um **API Token** restrito à conta correta usando o modelo oficial
   **Edit Cloudflare Workers**. Nunca cole o token em chats ou commits.
5. No GitHub, abra [Settings → Secrets and variables → Actions](https://github.com/contabilmarcos/SAGAS/settings/secrets/actions).
   Na aba **Secrets**, crie:
   - `CLOUDFLARE_ACCOUNT_ID`: ID da conta Cloudflare (32 caracteres hexadecimais)
   - `CLOUDFLARE_API_TOKEN`: token criado na etapa anterior
   - `CLOUDFLARE_D1_DATABASE_ID`: UUID do banco D1 de produção já vinculado
6. Na aba **Variables**, crie:
   - `CLOUDFLARE_D1_DATABASE_NAME`: nome real do mesmo banco D1
   - `SAGAS_CLOUDFLARE_AUTO_DEPLOY`: deixe ausente ou `disabled` durante a primeira verificação. Altere para **enabled** somente depois que a verificação manual passar.

## Primeira verificação (sem publicar)

1. No GitHub abra **Actions → SAGAS - Publicar Worker no Cloudflare**.
2. Clique em **Run workflow** e escolha o modo **verificar**.
3. Abra a execução e confirme que a etapa **Conferir Worker e banco D1 de produção sem modificar nada** passou.
4. Só então vá para **Settings → Secrets and variables → Actions → Variables** e configure
   `SAGAS_CLOUDFLARE_AUTO_DEPLOY` com `enabled`.
5. Volte a **Actions → SAGAS - Publicar Worker no Cloudflare → Run workflow**,
   escolha **publicar** e acompanhe a execução até o sucesso.
6. Após o deploy, abra o SAGAS e confira login, empresa selecionada e uma consulta de folha.
   Se houver qualquer erro, suspenda a variável de deploy antes de prosseguir.

O modo `verificar` não publica nenhum código: confere os segredos e identifica o
Worker existente e o mesmo UUID do banco D1 vinculado como `DB` no Cloudflare.
A execução é bloqueada se detectar outro banco ou vínculos adicionais não previstos.

## Como funciona

Após a ativação:
- Push na branch `main` alterando `SAGAS_worker.js` dispara o deploy.
- Alterações somente no `index.html` **não** atualizam o Worker.
- Também há um botão de execução manual em **Actions → SAGAS - Publicar Worker no Cloudflare → Run workflow**.
- O workflow valida sintaxe e checa todas as configurações antes de publicar.
- Uma configuração `wrangler.sagas.deploy.json` é gerada **apenas no ambiente temporário da execução**, não é commitada.
- `keep_vars` preserva variáveis do dashboard; segredos existentes do Worker são mantidos.
- O banco D1 não é recriado nem são rodados SQL ou migrações manualmente.

## Antes da primeira publicação

Confira no Cloudflare, no Worker **sagas-api**:
- que o **Worker name** é exatamente `sagas-api`;
- que o D1 está vinculado sob a variável `DB`;
- que a compatibilidade atual é adequada à data do workflow (`2025-01-01`);
- que `ALLOWED_ORIGINS`, `BOOTSTRAP_SECRET` e outras variáveis/segredos
  existentes permanecem configuradas.

O workflow NÃO inclui integrações de eSocial, não altera o frontend nem
faz operações diretas no banco.

## Como interromper

Em **GitHub → Settings → Secrets and variables → Actions → Variables**, altere
`SAGAS_CLOUDFLARE_AUTO_DEPLOY` de `enabled` para `disabled`.
Isso suspende futuros deploys via workflow sem apagar arquivos.

## Referências

- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/workers/wrangler/configuration/
