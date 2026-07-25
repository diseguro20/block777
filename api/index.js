import express from 'express';
import cors from 'cors';
import authRoutes from '../routes/auth.js';
import gameRoutes from '../routes/game.js';
import walletRoutes from '../routes/wallet.js';
import affiliateRoutes from '../routes/affiliate.js';
import adminRoutes from '../routes/admin.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/admin', adminRoutes);

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
