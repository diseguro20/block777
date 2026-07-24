-- Script de Criação das Tabelas e Triggers no Supabase para Blockerino Bet

-- 1. Tabela de Carteiras de Usuários
CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT UNIQUE NOT NULL DEFAULT 'guest_user',
    balance NUMERIC(12, 2) NOT NULL DEFAULT 100.00 CHECK (balance >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insere carteira padrão inicial se não existir
INSERT INTO public.wallets (user_id, balance)
VALUES ('guest_user', 100.00)
ON CONFLICT (user_id) DO NOTHING;

-- 2. Tabela de Transações PIX (Depósitos e Saques)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'guest_user',
    type TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'canceled')),
    pix_code TEXT,
    pix_qr_code TEXT,
    vizzion_tx_id TEXT UNIQUE,
    pix_key TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Histórico de Apostas
CREATE TABLE IF NOT EXISTS public.bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'guest_user',
    game_mode TEXT NOT NULL,
    bet_amount NUMERIC(12, 2) NOT NULL CHECK (bet_amount > 0),
    multiplier NUMERIC(8, 2) NOT NULL DEFAULT 1.00,
    payout NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cashed_out BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Função & Trigger para Atualização Automática de Saldo na Conclusão de Transação
CREATE OR REPLACE FUNCTION public.process_completed_transaction()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        IF NEW.type = 'deposit' THEN
            UPDATE public.wallets
            SET balance = balance + NEW.amount,
                updated_at = NOW()
            WHERE user_id = NEW.user_id;
        ELSIF NEW.type = 'withdraw' THEN
            UPDATE public.wallets
            SET balance = balance - NEW.amount,
                updated_at = NOW()
            WHERE user_id = NEW.user_id AND balance >= NEW.amount;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_process_completed_transaction ON public.transactions;
CREATE TRIGGER trigger_process_completed_transaction
AFTER UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.process_completed_transaction();

-- 5. Habilitar RLS (Row Level Security) permissivo para anon/authenticated
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso Livre Wallets" ON public.wallets FOR ALL USING (true);
CREATE POLICY "Acesso Livre Transactions" ON public.transactions FOR ALL USING (true);
CREATE POLICY "Acesso Livre Bets" ON public.bets FOR ALL USING (true);
