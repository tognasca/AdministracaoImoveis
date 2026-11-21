# Homologação multiempresa

O Compose mantém o modo de instalação única por padrão. Com
`SAAS_ENABLE_MULTI_TENANT=true`, cada hostname precisa constar em
`saas_domains`, com `verified_at` preenchido e vinculado a uma imobiliária
ativa. Isso inclui o hostname da imobiliária original. Hosts desconhecidos,
não verificados e suspensos recebem HTTP 421.

O proxy deve preservar o host aceito e encaminhar somente domínios da
instalação. O bootstrap por `Admin__Password` cria somente o administrador
da instalação original.

## Cadastro de uma imobiliária

Configure `SAAS_PLATFORM_ADMIN_KEY` com uma chave aleatória de pelo menos
32 caracteres. Faça as chamadas abaixo no hostname da instalação original
com a sessão do administrador, o cabeçalho `X-Saas-Platform-Key` e
`X-Imoveis-Action: 1` nas operações de escrita.

1. Envie `POST /api/platform/imobiliarias` com `slug`, `name`, `username` e
   `password`. O retorno inclui o identificador da imobiliária.
2. Envie `POST /api/platform/imobiliarias/{id}/dominios` com `hostname`.
   Solicite ao cliente a publicação do TXT retornado em `dnsRecord`.
3. Consulte o DNS público e confira se o TXT publicado corresponde ao desafio.
   Em seguida envie o valor observado como `dnsValue` no
   `POST /api/platform/imobiliarias/{id}/dominios/{hostname}/verificacao`.
   A API registra a confirmação feita pelo operador e consome o desafio.
4. Configure a rota no proxy e o HTTPS para o novo hostname. Entre no painel
   pelo hostname do cliente com o administrador inicial.

Use `PUT /api/platform/imobiliarias/{id}/estado` com `status` igual a
`suspended` ou `active` para bloquear ou restabelecer o acesso por domínio.

## Dados preservados

- As migrações 018–020 atribuem os registros existentes de importação e vitrine
  à imobiliária original, ajustam as chaves por empresa e mantêm as restrições
  de propriedade e os vínculos por tenant.
- Fotos, logotipo e banner da instalação original mantêm os caminhos em disco.
  Novas imobiliárias usam diretórios próprios sob `Media:Path`.
- A migração 021 registra novas etapas do CRM e o usuário que fez cada mudança.
  Leads anteriores mantêm os dados existentes e ganham histórico quando a
  etapa muda.

## Validação de liberação

- O workflow executa build .NET 10, testes de parsers, inicialização com as
  migrações em PostgreSQL 17 sobre o esquema anterior, preservação de registros
  legados, regressão da instalação original e testes HTTP
  de acesso cruzado entre dois domínios em banco descartável.
- Antes de liberar clientes, validar a atualização e a restauração com uma
  cópia representativa do banco e da mídia da instalação, o proxy HTTPS e o
  fluxo de sessão em navegador.
- Ainda precisam de homologação visual os fluxos no desktop, smartphone e
  tablet, a revisão de fotos extraídas de PDFs por imóvel e os fluxos de
  operação do CRM e de domínios.
