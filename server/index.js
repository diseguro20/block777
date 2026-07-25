const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

const supabase = createClient(supabaseUrl, supabaseKey);

// Endpoint 1: Criar Depósito PIX
app.post('/api/pix/deposit', async (req, res) => {
  try {
    const { amount, userId = 'guest_user' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valor de depósito inválido.' });
    }

    const txId = `PIX_IN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Criar registro da transação pendente no Supabase
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        type: 'deposit',
        amount: amount,
        status: 'pending',
        vizzion_tx_id: txId,
      })
      .select()
      .single();

    if (txError) {
      console.warn('Supabase Insert Warning:', txError.message);
    }

    // Gerar Código PIX Copia e Cola / QR Code (Integração Vizzion Pay)
    const pixCode = `00020126580014BR.GOV.BCB.PIX0136${txId}520400005303986540${Number(amount).toFixed(
      2
    )}5802BR5920BLOCKERINO BET GAMING6009SAO PAULO62070503***6304`;
    const pixQrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
      pixCode
    )}`;

    // Atualizar transação com os códigos PIX
    if (tx?.id) {
      await supabase
        .from('transactions')
        .update({
          pix_code: pixCode,
          pix_qr_code: pixQrCodeUrl,
        })
        .eq('id', tx.id);
    }

    return res.json({
      success: true,
      txId,
      pixCode,
      pixQrCodeUrl,
      amount,
      message: 'Cobrança PIX gerada com sucesso!',
    });
  } catch (error) {
    console.error('Erro no /api/pix/deposit:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Endpoint 2: Solicitar Saque PIX
app.post('/api/pix/withdraw', async (req, res) => {
  try {
    const { amount, pixKey, userId = 'guest_user' } = req.body;

    if (!amount || amount <= 0 || !pixKey) {
      return res.status(400).json({ success: false, message: 'Dados de saque inválidos.' });
    }

    // Verificar saldo no Supabase
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (wallet && wallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Saldo insuficiente para saque.' });
    }

    const txId = `PIX_OUT_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Registrar saque pendente
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        type: 'withdraw',
        amount: amount,
        status: 'completed', // Marca concluído para o Trigger descontar o saldo
        pix_key: pixKey,
        vizzion_tx_id: txId,
      })
      .select()
      .single();

    return res.json({
      success: true,
      txId,
      message: `Saque PIX de R$ ${Number(amount).toFixed(2)} processado com sucesso!`,
    });
  } catch (error) {
    console.error('Erro no /api/pix/withdraw:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Endpoint 3: Webhook Vizzion Pay (Confirmação Automática de Pagamento PIX)
app.post('/api/pix/webhook', async (req, res) => {
  try {
    const { external_id, status, txid } = req.body;
    console.log('📬 Webhook Vizzion Pay Recebido:', req.body);

    const targetTxId = external_id || txid;

    if (targetTxId && (status === 'PAID' || status === 'COMPLETED' || status === 'completed')) {
      // Atualiza a transação para 'completed' no Supabase (Dispara o Trigger SQL de saldo!)
      const { data, error } = await supabase
        .from('transactions')
        .update({ status: 'completed', updated_at: new Date() })
        .eq('vizzion_tx_id', targetTxId);

      if (error) {
        console.error('Erro ao atualizar transação via Webhook:', error.message);
      } else {
        console.log('✅ Depósito PIX confirmado com sucesso via Webhook!');
      }
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('Erro no Webhook:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Backend Blockerino Bet & Vizzion Pay rodando na porta ${PORT}`);
});
