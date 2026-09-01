# Blockerino

Plataforma web de jogo de blocos com carteira, apostas, resgate durante a partida,
programa de afiliados em dois níveis e painel administrativo.

## Executar

```bash
npm install
npm run dev
```

Abra `http://localhost:3001`.

## Segurança e configuração

O projeto não cria administrador padrão e não aceita senha mestre. Administradores
são registros protegidos no Firestore e toda senha é armazenada como hash bcrypt.
Copie `.env.example` para `.env.local` no desenvolvimento e defina os valores sem
versionar o arquivo. Em produção, configure as mesmas variáveis diretamente na
Vercel e marque chaves privadas, segredo JWT e credenciais do gateway como
**Sensitive/Secret**.

Nenhuma variável de Firebase Admin, JWT ou Vizzion Pay é enviada para o navegador.
O front-end recebe somente identidade visual, banners e dados permitidos pelas APIs.

## Funcionalidades

- Cadastro e autenticação com sessão JWT
- Jogo clássico 8×8 e modo caos 10×10
- Apostas entre limites configuráveis, resgate e histórico
- Depósito e saque PIX com fila de aprovação
- Dashboard com saldo, partidas, retorno e melhor multiplicador
- Afiliados em dois níveis com taxas configuráveis
- Painel administrativo para usuários, saldo, status, influenciadores,
  depósitos, saques, dificuldade, limites, comissões e manutenção
- Operações white label isoladas por cliente, com administrador próprio
- Modo de infraestrutura explícito por white label: compartilhado ou isolado. Operações isoladas permanecem como "aguardando recursos" até que Vercel, Firebase e URL próprios sejam vinculados; nenhum segredo é salvo no frontend ou no documento do cliente.
- Marca, cores e banners editáveis para landing page, dashboard e afiliados
- Armazenamento local persistente para desenvolvimento

O modo local usa dados de homologação. A produção utiliza Firestore e o gateway
configurado no servidor. Não utilize o código PIX simulado do modo local para cobrar clientes.
