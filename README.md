# Crias

Crias é um aplicativo de hábitos e metas em grupo com gamificação no estilo de um jogo de RPG. A pessoa cria hábitos, entra em grupos, faz o check in do que cumpriu no dia e ganha ouro, vida e sequência de dias seguidos. Existe uma loja de prêmios e um personagem que evolui.

Ele funciona pelo navegador do celular e pode ser instalado na tela de início como se fosse um aplicativo comum. É isso que a sigla PWA significa. As notificações no celular são a parte mais importante do produto: elas lembram a pessoa na hora certa e o check in acontece em dois toques.

Este documento foi escrito para quem não é da área de tecnologia. Basta seguir os passos na ordem.

---

## Aviso importante sobre o banco de dados

O Crias usa o Supabase, que é o serviço onde ficam guardados os dados dos usuários.

- O projeto correto do Crias é o de identificador **`oeaftenwsmbkdxqseqrb`**. É nele, e somente nele, que qualquer alteração pode ser feita.
- Existe outro projeto na mesma conta, de identificador **`outro-projeto`**. Ele pertence a **outro sistema** e **não pode ser tocado em hipótese alguma**. Qualquer comando executado nele pode destruir dados de um produto diferente.

A chave de acesso guardada no arquivo `.env` enxerga os dois projetos ao mesmo tempo. Por isso a regra: antes de rodar qualquer comando que mexa no banco, confirme que o identificador na tela é o `oeaftenwsmbkdxqseqrb`.

---

## O que instalar antes de começar

1. **Node.js**, versão 20 ou mais recente. É o programa que executa o projeto no computador. Baixe em `https://nodejs.org` e instale normalmente, avançando as telas.
2. Um editor de texto para código, como o **Visual Studio Code**. Opcional, mas ajuda.

Para conferir se o Node foi instalado, abra o Terminal e digite:

```bash
node --version
```

Se aparecer um número começando com `v20` ou maior, está tudo certo.

---

## Como rodar o projeto no seu computador

Abra o Terminal, entre na pasta do projeto e rode os comandos abaixo, um de cada vez.

**Passo 1.** Instalar as bibliotecas que o projeto usa. Esse comando só precisa ser rodado na primeira vez, ou quando alguém adicionar uma biblioteca nova.

```bash
npm install
```

**Passo 2.** Criar o arquivo de configuração. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

Depois abra o arquivo `.env` no editor e preencha os valores. A próxima seção explica o que é cada um.

**Passo 3.** Ligar o projeto:

```bash
npm run dev
```

Vai aparecer um endereço no Terminal. Abra no navegador:

```
http://localhost:8080
```

Para desligar, volte ao Terminal e aperte `Control` e `C` ao mesmo tempo.

### Outros comandos úteis

| Comando | Para que serve |
| --- | --- |
| `npm run dev` | Liga o projeto no seu computador, na porta 8080 |
| `npm run build` | Monta a versão final, a mesma que vai para o ar. Serve para conferir se está tudo certo antes de publicar |
| `npm run typecheck` | Confere se não existe erro de programação no código |
| `npm run test` | Roda os testes automáticos |

---

## O arquivo `.env` e o que cada variável faz

O `.env` guarda as senhas e endereços que o projeto precisa. Ele **nunca** deve ser enviado para o GitHub nem colado em conversa, e já está configurado para ser ignorado pelo controle de versão.

O arquivo `.env.example` é a lista em branco desses campos. Ele pode ir para o GitHub porque não tem nenhum valor preenchido.

### Variáveis que o aplicativo usa no navegador

Estas começam com `VITE_`. Tudo que começa com `VITE_` fica **visível para qualquer pessoa** que abrir o site, então aqui só entram valores públicos. Nunca coloque uma senha em uma variável `VITE_`.

| Variável | O que é, em linguagem simples |
| --- | --- |
| `VITE_SUPABASE_URL` | O endereço do banco de dados do Crias. É como o endereço de uma loja: público, e sem ele o aplicativo não sabe para onde ligar |
| `VITE_SUPABASE_ANON_KEY` | A chave pública de acesso ao banco. Ela sozinha não dá permissão para ver dado de ninguém, porque quem decide o que cada pessoa pode ver são as regras de segurança configuradas dentro do Supabase |
| `VITE_VAPID_PUBLIC_KEY` | A metade pública da chave que autoriza o envio de notificações para o celular da pessoa. O navegador precisa dela para aceitar receber avisos |
| `VITE_APP_TIMEZONE` | O fuso horário do aplicativo. Sempre `America/Sao_Paulo` |

### Variáveis secretas, que ficam só no seu computador e no servidor

Estas **não** vão para o navegador e **não** devem ser cadastradas na Vercel como `VITE_`. Elas são usadas em comandos de manutenção e dentro do servidor do Supabase.

| Variável | O que é, em linguagem simples |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Sua chave pessoal de administrador da conta Supabase. Ela abre os dois projetos da conta, inclusive o que não pode ser tocado. Trate como a senha do banco |
| `SUPABASE_SERVICE_ROLE_KEY` | A chave mestra do banco do Crias. Ignora todas as regras de segurança e enxerga tudo. Usada apenas por rotinas do servidor |
| `SUPABASE_DB_PASSWORD` | A senha direta do banco de dados |
| `SUPABASE_PROJECT_REF` | O identificador do projeto do Crias. Precisa ser exatamente `oeaftenwsmbkdxqseqrb`. Os comandos do projeto conferem esse valor e se recusam a rodar se estiver diferente, justamente para proteger o outro sistema |
| `SUPABASE_ORG_ID` | O identificador da organização dentro do Supabase |
| `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` | O par de chaves que assina as notificações. A parte privada prova que o aviso saiu mesmo do Crias, e nunca pode vazar |
| `VAPID_SUBJECT` | Um e mail ou endereço de contato exigido pelo padrão de notificações, para o caso de algum serviço precisar falar com o responsável pelo aplicativo |
| `TZ` | O fuso horário usado pelos comandos rodados no computador. Sempre `America/Sao_Paulo` |

---

## Como aplicar uma alteração no banco de dados

Uma alteração no banco se chama **migration**. São os arquivos numerados dentro da pasta `supabase/migrations`, por exemplo `0011_escada_push.sql`. Cada um descreve uma mudança na estrutura do banco, como criar uma tabela nova.

Para aplicar um desses arquivos, rode:

```bash
node scripts/sql.mjs supabase/migrations/0011_escada_push.sql
```

Regras práticas:

- Aplique os arquivos em ordem crescente de número.
- Nunca edite um arquivo que já foi aplicado. Se algo precisa mudar, crie um arquivo novo com o próximo número da sequência.
- O comando confere sozinho se o projeto configurado é o do Crias. Se aparecer a mensagem `ABORTADO`, significa que o `SUPABASE_PROJECT_REF` do seu `.env` está apontando para o projeto errado. Corrija o `.env` antes de tentar de novo, e não force o comando.

Para rodar uma consulta rápida sem criar arquivo, existe também:

```bash
node scripts/sql.mjs -e "select public.hoje_sp()"
```

---

## Como publicar na Vercel

A Vercel é o serviço que coloca o site no ar. O funcionamento é automático: assim que o código novo chega no GitHub, na branch `main`, a Vercel monta e publica a versão nova sozinha.

### Primeira vez

1. Entre em `https://vercel.com` e crie a conta, de preferência entrando com o GitHub.
2. Clique em **Add New** e depois em **Project**.
3. Escolha o repositório `gustacg/crias`.
4. A Vercel reconhece o projeto sozinha pelo arquivo `vercel.json` que já está aqui. Não é preciso mudar nada nos campos de build.
5. Antes de clicar em **Deploy**, abra a seção **Environment Variables** e cadastre as três variáveis abaixo. Elas são as únicas que a Vercel precisa.

| Variável para cadastrar na Vercel | Onde pegar o valor |
| --- | --- |
| `VITE_SUPABASE_URL` | O mesmo valor que está no seu `.env` |
| `VITE_SUPABASE_ANON_KEY` | O mesmo valor que está no seu `.env` |
| `VITE_VAPID_PUBLIC_KEY` | O mesmo valor que está no seu `.env` |

Marque cada uma para os três ambientes oferecidos: **Production**, **Preview** e **Development**.

**Não cadastre na Vercel** nenhuma variável secreta, como `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` ou `VAPID_PRIVATE_KEY`. O site é público e essas chaves não têm o que fazer nele. Elas ficam guardadas dentro do Supabase.

6. Clique em **Deploy** e aguarde. No fim aparece o endereço do site.

### Nas próximas vezes

Basta enviar o código para o GitHub:

```bash
git add .
git commit -m "descrição curta do que mudou"
git push
```

A Vercel percebe e publica sozinha em poucos minutos.

### Se você mudar uma variável na Vercel

Alterar o valor de uma variável **não** atualiza o site sozinho. É preciso pedir um novo deploy: no painel da Vercel, abra a aba **Deployments**, clique nos três pontos do deploy mais recente e escolha **Redeploy**.

---

## Detalhe técnico que evita a dor de cabeça mais comum

O arquivo `public/sw.js` é o Service Worker, o pedacinho de código que fica instalado no celular da pessoa e é responsável por receber as notificações. Se ele ficasse guardado em cache por muito tempo, o usuário continuaria rodando uma versão antiga do aplicativo mesmo depois de uma atualização, e às vezes por dias.

O arquivo `vercel.json` já resolve isso. Ele manda o servidor conferir o `sw.js` a cada visita, deixa o `sw.js` e o manifesto do aplicativo serem baixados diretamente, sem passar pelo redirecionamento das telas, e libera o cache longo apenas para os arquivos que já mudam de nome a cada versão. Não é preciso mexer nesse arquivo no dia a dia.

---

## Se algo der errado

| Problema | O que fazer |
| --- | --- |
| `command not found: npm` | O Node.js não está instalado. Volte para a seção de instalação |
| A página abre em branco | Confira se o `.env` existe e se `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estão preenchidos. Depois desligue e ligue o `npm run dev` de novo |
| As notificações não chegam | No iPhone, o aplicativo precisa estar instalado na tela de início para receber avisos. Essa é uma limitação do próprio iPhone, não do Crias |
| O comando de banco responde `ABORTADO` | O `SUPABASE_PROJECT_REF` do `.env` está errado. Ele precisa ser `oeaftenwsmbkdxqseqrb` |
| O site publicado ficou desatualizado | Peça um **Redeploy** no painel da Vercel e recarregue a página segurando a tecla `Shift` |
