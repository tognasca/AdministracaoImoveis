# Homologação multiempresa

O Compose mantém o modo de instalação única por padrão. Com
`SAAS_ENABLE_MULTI_TENANT=true`, cada hostname precisa constar em
`saas_domains`, com `verified_at` preenchido e vinculado a uma imobiliária
ativa. Isso inclui o hostname da imobiliária original. Hosts desconhecidos,
não verificados e suspensos recebem HTTP 421.

O proxy deve preservar o host aceito e encaminhar somente domínios da
instalação. Confirme a titularidade de cada domínio antes de registrar a
verificação. A branch ainda depende de provisionamento operacional de tenants,
domínios e administrador inicial de novas imobiliárias. O bootstrap por
`Admin__Password` cria somente o administrador da instalação original.

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
  migrações em PostgreSQL 17, regressão da instalação original e testes HTTP
  de acesso cruzado entre dois domínios em banco descartável.
- Antes de liberar clientes, validar a atualização e a restauração com uma
  cópia representativa do banco e da mídia da instalação, o proxy HTTPS e o
  fluxo de sessão em navegador.
- Ainda precisam de homologação visual os fluxos no desktop, smartphone e
  tablet, a revisão de fotos extraídas de PDFs por imóvel e os fluxos de
  operação do CRM e de domínios.
