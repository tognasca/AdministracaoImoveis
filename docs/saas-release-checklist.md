# Migração SaaS — checklist de liberação

Status: **estrutura inicial; NÃO habilitar multiempresa em produção**.

## Implementado
- Tenant legado e vínculo de imóveis (migração 014).
- Usuários com vínculo de tenant, tabela de domínios, catálogo de planos,
  assinaturas e leads (migração 015).
- Temas Moderno, Premium e Comercial para o tenant legado.
- Bloqueio de inicialização caso `Saas:EnableMultiTenant=true`.

## Bloqueadores para liberar clientes distintos
1. Resolver tenant exclusivamente por hostname verificado, rejeitando hosts desconhecidos.
2. Vincular login/cookie ao tenant e validar tenant, usuário, função e status em cada requisição.
3. Aplicar `tenant_id` a TODAS as consultas, atualizações e exclusões, inclusive
   propriedades, fotos, equipe, importação, exportação, menus, identidade e assets.
4. Criar chaves únicas por tenant e migrações seguras para dados legados.
5. Isolar armazenamento físico de fotos e assets por tenant; bloquear acesso cruzado.
6. Garantir autorização de plataforma separada da autorização da imobiliária.
7. Implementar provisionamento, suspensão e recuperação de tenants com auditoria.
8. Integrar provedor de pagamentos com webhooks autenticados e idempotentes,
   conciliação, regras de cobrança e testes de falhas.
9. Implementar endpoints e UI do CRM com consentimento, LGPD e permissões.
10. Integrar IA e portais apenas com credenciais por tenant e quotas.
11. Executar build, testes unitários, integração, migração, E2E, segurança e backup/restauração.

## Critérios mínimos de homologação
- Dois tenants com usuários, imóveis, fotos, domínios e menus distintos.
- Acesso por ID de outro tenant retorna 404/403 em todas as rotas.
- Upload/importação/exportação não vazam dados nem arquivos.
- Cookie emitido para um domínio não autoriza acesso a outro tenant.
- Tenant suspenso não consegue usar endpoints administrativos.
- Reprocessamento de webhook não duplica cobrança.
- Rollback e restauração de backup validados em ambiente de homologação.

A migração 015 cria **somente tabelas**. Não implica cobrança ativa,
CRM operacional, domínios resolvidos, isolamento concluído ou publicação.
