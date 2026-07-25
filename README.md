# BLOCK777 — Plataforma iGaming Serverless

Plataforma de jogo arcade/aposta web com tema Festa Junina, rodando serverless na Vercel com Firebase Firestore.

## Tech Stack

- **Backend**: Node.js ES Modules, Express.js (Vercel Serverless Function)
- **Database**: Firebase Firestore (Admin SDK)
- **Auth**: JWT Bearer Tokens
- **Frontend**: Vanilla HTML5, CSS3 (Glassmorphism), JavaScript ES6
- **Deploy**: Vercel + GitHub

## Funcionalidades

- 🎮 Motor de jogo HTML5 Canvas arcade
- 💰 Sistema de apostas real/demo com multiplicadores
- 💳 Carteira PIX (depósitos e saques)
- 👑 Painel administrativo completo
- 🤝 Sistema de afiliados 2 níveis
- ⭐ Modo Influencer
- 🔧 Controle de dificuldade/retenção dinâmico (easy/balanced/strict)
- 📱 100% responsivo mobile-first

## Estrutura

```
api/index.js          → Express serverless entry point
routes/               → auth, game, wallet, affiliate, admin
lib/firebase.js       → Firebase Admin SDK
middleware/            → JWT auth + admin guard
public/               → HTML, CSS, JS (frontend estático)
vercel.json           → Configuração Vercel
```

## Deploy

1. Push para GitHub
2. Importar projeto na Vercel
3. Configurar Environment Variables:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - `JWT_SECRET`
4. Deploy automático!

## Valores Monetários

Todos os valores no banco e APIs são em **CENTAVOS** (inteiros).  
`100 centavos = R$ 1,00`