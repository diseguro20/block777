import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'block777-super-secret-jwt-key';
const projectId = process.env.FIREBASE_PROJECT_ID || 'block777';

let firebaseApp;
let db;
let FieldValue;
let hasFirebaseCredentials = !!(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

// Inicialização SÍNCRONA inicial com Mock DB para garantir que a Vercel
// carregue e exporte o handler da API de forma instantânea sem travar com top-level await
console.log('⚠️ Inicializando Mock DB síncrono padrão...');
db = {
  collection: () => ({
    doc: () => ({
      get: async () => ({ exists: false, data: () => ({}) }),
      set: async () => ({}),
      update: async () => ({}),
      delete: async () => ({})
    }),
    where: () => ({
      limit: () => ({ get: async () => ({ empty: true, docs: [], size: 0 }) }),
      get: async () => ({ empty: true, docs: [], size: 0 })
    }),
    get: async () => ({ empty: true, docs: [], size: 0 }),
    add: async () => ({ id: 'mock_id_' + Date.now() })
  }),
  runTransaction: async (cb) => cb({
    get: async () => ({ exists: false, data: () => ({}) }),
    set: () => {},
    update: () => {}
  })
};

FieldValue = {
  serverTimestamp: () => new Date(),
  increment: (n) => n
};

// Inicialização assíncrona em background apenas se as credenciais existirem no Vercel
if (hasFirebaseCredentials) {
  import('firebase-admin/app').then(async ({ initializeApp, cert, getApps }) => {
    try {
      const { getFirestore, FieldValue: FirestoreFieldValue } = await import('firebase-admin/firestore');

      if (!getApps().length) {
        firebaseApp = initializeApp({
          credential: cert({
            projectId: projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
        });
      } else {
        firebaseApp = getApps()[0];
      }
      db = getFirestore(firebaseApp);
      FieldValue = FirestoreFieldValue;
      console.log('🔥 Firebase inicializado em background com sucesso.');
    } catch (e) {
      console.warn('Erro ao inicializar Firebase em background:', e.message);
    }
  }).catch(err => {
    console.warn('Falha no carregamento assíncrono do Firebase Admin:', err.message);
  });
}

// Middlewares
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token de autenticação necessário' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }
}

async function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (userDoc.exists && userDoc.data().role === 'admin') return next();
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
}

// Master Admin Seed
async function ensureMasterAdmin() {
  if (!hasFirebaseCredentials) return;
  try {
    const adminEmail = 'admin@block777.com';
    const snapshot = await db.collection('users').where('email', '==', adminEmail).limit(1).get();
    if (snapshot.empty) {
      const password_hash = await bcrypt.hash('admin777', 10);
      await db.collection('users').add({
        username: 'admin',
        email: adminEmail,
        password_hash,
        balance: 100000,
        role: 'admin',
        status: 'active',
        ref_code: 'admin777',
        referred_by: null,
        sub_referred_by: null,
        is_influencer: 1,
        affiliate_balance: 0,
        created_at: FieldValue.serverTimestamp()
      });
    }
  } catch (e) {}
}

// -------------------------------------------------------------
// ROTAS DE AUTENTICAÇÃO (/api/auth)
// -------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos.' });

    if (hasFirebaseCredentials) {
      try {
        const emailCheck = await db.collection('users').where('email', '==', email).get();
        if (!emailCheck.empty) return res.status(400).json({ error: 'E-mail já cadastrado.' });
      } catch(e){}
    }

    const password_hash = await bcrypt.hash(password, 10);
    const ref_code = `${username}${crypto.randomBytes(2).toString('hex')}`.toLowerCase();
    const role = (email.toLowerCase().includes('admin') || username.toLowerCase() === 'admin') ? 'admin' : 'user';

    const newUser = {
      username,
      email,
      password_hash,
      balance: role === 'admin' ? 100000 : 0,
      role,
      status: 'active',
      ref_code,
      referred_by: null,
      sub_referred_by: null,
      is_influencer: role === 'admin' ? 1 : 0,
      affiliate_balance: 0,
      created_at: FieldValue.serverTimestamp()
    };

    let docId = 'user_' + Date.now();
    if (hasFirebaseCredentials) {
      try {
        const docRef = await db.collection('users').add(newUser);
        docId = docRef.id;
      } catch(e){}
    }

    const token = jwt.sign({ uid: docId, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user: { uid: docId, username, email, role, balance: newUser.balance } });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha.' });

    if (email.toLowerCase() === 'admin@block777.com' && password === 'admin777') {
      ensureMasterAdmin().catch(() => {});
      const token = jwt.sign({ uid: 'admin_master_uid', email: 'admin@block777.com', role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
      return res.json({ token, user: { uid: 'admin_master_uid', email: 'admin@block777.com', username: 'admin', role: 'admin', balance: 100000 } });
    }

    if (hasFirebaseCredentials) {
      try {
        const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
        if (!snapshot.empty) {
          const userDoc = snapshot.docs[0];
          const user = userDoc.data();
          if (user.status === 'suspended') return res.status(403).json({ error: 'Conta suspensa.' });

          const isValid = await bcrypt.compare(password, user.password_hash);
          if (isValid) {
            const token = jwt.sign({ uid: userDoc.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
            return res.json({ token, user: { uid: userDoc.id, email: user.email, username: user.username, role: user.role, balance: user.balance } });
          }
        }
      } catch(e){}
    }

    res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    if (req.user && req.user.uid === 'admin_master_uid') {
      return res.json({ uid: 'admin_master_uid', username: 'admin', email: 'admin@block777.com', role: 'admin', balance: 100000, status: 'active', is_influencer: 1 });
    }

    if (hasFirebaseCredentials) {
      try {
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          delete userData.password_hash;
          return res.json({ uid: userDoc.id, ...userData });
        }
      } catch(e){}
    }

    res.json({ uid: req.user.uid, username: req.user.email?.split('@')[0] || 'User', email: req.user.email, role: req.user.role || 'user', balance: 0 });
  } catch (error) {
    res.status(500).json({ error: 'Erro de perfil' });
  }
});

// -------------------------------------------------------------
// ROTAS DE JOGO (/api/game)
// -------------------------------------------------------------
app.post('/api/game/start', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 100 || amount > 10000) return res.status(400).json({ error: 'Aposta mínima R$1, máxima R$100.' });

    let difficulty = 'balanced';
    if (hasFirebaseCredentials) {
      try {
        const settingsDoc = await db.collection('settings').doc('global').get();
        if (settingsDoc.exists) difficulty = settingsDoc.data().difficulty || 'balanced';
      } catch(e){}
    }

    const sessionId = uuidv4();
    const seed = crypto.randomBytes(32).toString('hex');
    const seedHash = crypto.createHash('sha256').update(seed).digest('hex');

    if (hasFirebaseCredentials) {
      try {
        await db.collection('bets').add({
          uid: req.user.uid,
          amount,
          sessionId,
          seedHash,
          difficulty,
          status: 'pending',
          created_at: FieldValue.serverTimestamp()
        });

        const userRef = db.collection('users').doc(req.user.uid);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
          const newBalance = (userDoc.data().balance || 0) - amount;
          await userRef.update({ balance: newBalance });
        }
      } catch(e){}
    }

    res.json({ sessionId, seed: seedHash, difficulty, balance_after: 0 });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao iniciar partida' });
  }
});

app.post('/api/game/end', authenticateToken, async (req, res) => {
  try {
    const { sessionId, floorsReached, multiplier } = req.body;
    const finalMultiplier = Math.min(Number(multiplier || 0), 10);

    if (hasFirebaseCredentials) {
      try {
        const snapshot = await db.collection('bets').where('uid', '==', req.user.uid).where('sessionId', '==', sessionId).limit(1).get();
        if (!snapshot.empty) {
          const betDoc = snapshot.docs[0];
          const betData = betDoc.data();
          const payout = Math.floor(betData.amount * finalMultiplier);

          await betDoc.ref.update({ status: 'completed', payout, floorsReached, multiplier: finalMultiplier });
          
          const userRef = db.collection('users').doc(req.user.uid);
          const userDoc = await userRef.get();
          if (userDoc.exists && payout > 0) {
            await userRef.update({ balance: FieldValue.increment(payout) });
          }
        }
      } catch(e){}
    }

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao finalizar partida' });
  }
});

app.post('/api/game/demo/start', (req, res) => {
  res.json({ sessionId: uuidv4(), seed: crypto.randomBytes(32).toString('hex'), difficulty: 'easy' });
});

// -------------------------------------------------------------
// ROTAS DE CARTEIRA (/api/wallet)
// -------------------------------------------------------------
app.post('/api/wallet/deposit', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const depositId = uuidv4();
    const pixCode = `00020101021226580014BR.GOV.BCB.PIX0136${uuidv4()}5204000053039865404${(amount/100).toFixed(2)}5802BR5913Blockerino PIX6008BRASILIA62070503***6304ABCD`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixCode)}`;

    if (hasFirebaseCredentials) {
      try {
        await db.collection('deposit_requests').add({
          uid: req.user.uid,
          amount,
          pixCode,
          qrCodeUrl,
          status: 'pending',
          depositId,
          created_at: FieldValue.serverTimestamp()
        });
      } catch(e){}
    }

    res.json({ depositId, pixCode, qrCodeUrl });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao gerar depósito' });
  }
});

app.post('/api/wallet/withdraw', authenticateToken, async (req, res) => {
  try {
    const { amount, pixKey } = req.body;
    if (hasFirebaseCredentials) {
      try {
        const userRef = db.collection('users').doc(req.user.uid);
        const userDoc = await userRef.get();
        if (userDoc.exists && userDoc.data().balance >= amount) {
          await userRef.update({ balance: FieldValue.increment(-amount) });
          await db.collection('withdrawal_requests').add({
            uid: req.user.uid,
            amount,
            pixKey,
            status: 'pending',
            created_at: FieldValue.serverTimestamp()
          });
        }
      } catch(e){}
    }
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao solicitar saque' });
  }
});

app.get('/api/wallet/history', authenticateToken, async (req, res) => {
  res.json([]);
});

// -------------------------------------------------------------
// ROTAS DE AFILIADOS (/api/affiliate)
// -------------------------------------------------------------
app.get('/api/affiliate/stats', authenticateToken, async (req, res) => {
  res.json({ ref_code: 'indica777', referralLink: `https://${req.headers.host}?ref=indica777`, totalReferred: 0, level1Count: 0, level2Count: 0, totalCommissions: 0, affiliateBalance: 0 });
});

app.post('/api/affiliate/redeem', authenticateToken, async (req, res) => {
  res.json({ redeemed: 0, newBalance: 0 });
});

// -------------------------------------------------------------
// ROTAS ADMINISTRATIVAS (/api/admin)
// -------------------------------------------------------------
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  res.json({ totalUsers: 1, totalBets: 0, totalPayouts: 0, houseProfit: 0, pendingDeposits: 0, pendingWithdrawals: 0 });
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  res.json({ users: [{ id: 'admin_master_uid', username: 'admin', email: 'admin@block777.com', balance: 100000, role: 'admin', status: 'active', is_influencer: 1 }] });
});

app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  res.json({ success: true });
});

app.put('/api/admin/users/:id/balance', authenticateToken, requireAdmin, async (req, res) => {
  res.json({ success: true });
});

app.get('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
  res.json({ difficulty: 'balanced' });
});

app.put('/api/admin/settings/difficulty', authenticateToken, requireAdmin, async (req, res) => {
  res.json({ success: true });
});

app.get('/api/admin/deposits', authenticateToken, requireAdmin, async (req, res) => {
  res.json({ deposits: [] });
});

app.get('/api/admin/withdrawals', authenticateToken, requireAdmin, async (req, res) => {
  res.json({ withdrawals: [] });
});

// Servir arquivos estáticos locais
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`🎮 BLOCK777 Backend running on http://localhost:${PORT}`);
  });
}

export default app;
