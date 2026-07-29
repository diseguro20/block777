# Blockerino

Plataforma web de jogo de blocos com carteira, apostas, resgate durante a partida,
programa de afiliados em dois níveis e painel administrativo.

## Executar

```bash
npm install
npm run dev
```

Abra `http://localhost:3001`.

## Contas locais

- Jogador: `demo@blockerino.app` / `demo123`
- Administrador: `admin@block777.com` / `admin777`

Troque `JWT_SECRET` e as credenciais iniciais antes de publicar em produção.

## Funcionalidades

- Cadastro e autenticação com sessão JWT
- Jogo clássico 8×8 e modo caos 10×10
- Apostas entre limites configuráveis, resgate e histórico
- Depósito e saque PIX com fila de aprovação
- Dashboard com saldo, partidas, retorno e melhor multiplicador
- Afiliados em dois níveis com taxas configuráveis
- Painel administrativo para usuários, saldo, status, influenciadores,
  depósitos, saques, dificuldade, limites, comissões e manutenção
- Armazenamento local persistente para desenvolvimento

Em produção, conecte um banco durável e um provedor PIX real. O código PIX local
é próprio para homologação e os pagamentos dependem de aprovação administrativa.
