# Imóveis Cotia

Primeira etapa do projeto. Uma aplicação ASP.NET Core 10 serve a vitrine e o painel administrativo. O PostgreSQL 17 armazena os cadastros e os metadados. Os arquivos de imagem ficam em uma pasta externa à instalação.

## Executar no Windows

Abra o Docker Desktop e extraia o ZIP. No PowerShell, dentro de ImoveisCotia:

```powershell
Copy-Item .env.example .env
New-Item -ItemType Directory -Force midia
notepad .env
```

Defina POSTGRES_PASSWORD com letras e números e ADMIN_PASSWORD com uma senha única de pelo menos 16 caracteres. Se preferir outro disco, crie a pasta e use, por exemplo, `MEDIA_DIRECTORY=D:/Imoveis/Midia`. O Docker Desktop deve ter acesso à pasta. No Linux, o usuário do container (UID 1654 da imagem .NET) precisa gravar no diretório montado.

```powershell
docker compose up -d --build
docker compose ps
Invoke-RestMethod http://localhost:5086/health
```

- Painel administrativo — http://localhost:5086/#admin
- Vitrine — http://localhost:5086/#vitrine

O modo Development permite a autenticação por HTTP no endereço local. A porta está vinculada a 127.0.0.1. Para uma implantação externa, configure HTTPS com o proxy, use Production e mantenha a porta do PostgreSQL interna. Não compartilhe o .env.

## Verificar o primeiro fluxo

1. Entre no painel com o usuário admin e a senha do .env. O primeiro startup cria esse usuário. A variável é usada no bootstrap, então trocar o .env depois da criação não redefine sua senha.
2. Crie um imóvel com código, origem, título, tipo, cidade e preço. Salve como rascunho.
3. Envie até cinco fotos JPEG, PNG ou WebP de até 8 MB cada. Selecione a capa e, se desejar, cadastre o link do álbum.
4. Atualize o status para Publicado e confirme que o imóvel e suas fotos aparecem na vitrine.
5. Tente enviar uma sexta imagem, marque o imóvel como Vendido e confirme que o anúncio sai da vitrine.
6. Reinicie os containers com `docker compose restart` e confirme que o cadastro e as fotos permanecem.

## Estrutura

- `src/Imoveis.Web` contém API, autenticação, vitrine e painel.
- `src/Imoveis.Web/Database/` contém as migrações aplicadas pela aplicação no início, inclusive em um volume criado com a versão inicial.
- `compose.yaml` sobe banco e aplicação. O volume database contém o banco e o volume keys contém as chaves das sessões. As fotos ficam na pasta montada pelo usuário.
- O URL do imóvel usa um UUID imutável. Origem e código têm unicidade independente de maiúsculas e minúsculas.
- O limite da galeria é imposto no banco. O álbum externo é um link opcional que abre o endereço de origem.
- A aplicação começa com o banco vazio. As fotos fictícias da demonstração não estão incluídas.
- Para backup, copie o banco com pg_dump e a pasta de mídia para um destino separado. Coordenar as cópias em uma janela sem alterações ajuda a manter a consistência entre registros e fotos.

## Importação e usuários

Em **Importações**, escolha XLSX, CSV ou TXT. Selecione a origem, revise o mapeamento e confirme o lote. A primeira aba do XLSX é usada e a primeira linha contém os cabeçalhos. Arquivos delimitados devem ser UTF-8. Uma coluna vazia preserva o conteúdo do cadastro existente. Novos imóveis entram como rascunho. O sistema preserva a identidade, o álbum, as fotos e o estado de publicação dos imóveis atualizados.

O administrador cadastra operadores na tela **Usuários**. Operadores gerenciam imóveis e importações. Apenas administradores gerenciam contas.

Defina VITRINE_WHATSAPP no .env para exibir o botão de contato nos anúncios.

## Teste de integração

Use um banco de homologação. O teste cria um imóvel de teste, registra uma importação e remove as fotos após verificar o fluxo. O cadastro de teste permanece retirado e o histórico permanece no banco.

```powershell
$env:IMOVEIS_ADMIN_PASSWORD = 'SENHA_DO_ADMIN'
node scripts/verificar-integracao.mjs
Remove-Item Env:IMOVEIS_ADMIN_PASSWORD
```

A homologação final inclui navegador no celular com HTTPS, dados reais do cliente, capacidade do disco e restauração do backup. OLX e Imovelweb pertencem à etapa futura de integração com portais. As telas são HTML e JavaScript servidos pelo ASP.NET Core.
