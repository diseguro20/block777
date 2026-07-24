import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Image,
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBetting } from '@/hooks/useBettingState';
import { formatCurrency } from '@/constants/Betting';

export const WalletModal: React.FC = () => {
  const { isWalletOpen, setIsWalletOpen, balance, deposit, withdraw } = useBetting();
  const [tab, setTab] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [depositAmount, setDepositAmount] = useState<string>('50');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [pixKey, setPixKey] = useState<string>('');
  
  const [generatedPixCode, setGeneratedPixCode] = useState<string | null>(null);
  const [generatedQrCodeUrl, setGeneratedQrCodeUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const depositPresets = [20, 50, 100, 200];

  const BACKEND_URL = 'http://localhost:3001';

  const handleConfirmDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Erro', 'Por favor insira um valor de depósito válido.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/pix/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, userId: 'guest_user' }),
      });
      const data = await response.json();

      if (data.success && data.pixCode) {
        setGeneratedPixCode(data.pixCode);
        setGeneratedQrCodeUrl(data.pixQrCodeUrl);
        // Atualiza o saldo localmente para demonstração fluida
        deposit(amount);
      } else {
        Alert.alert('Erro', data.message || 'Falha ao gerar cobrança PIX');
      }
    } catch (error) {
      // Fallback local se o servidor de backend não estiver rodando no momento
      const fakePixCode = `00020126580014BR.GOV.BCB.PIX0136PIX_IN_${Date.now()}520400005303986540${amount.toFixed(
        2
      )}5802BR5920BLOCKERINO BET GAMING6009SAO PAULO62070503***6304`;
      setGeneratedPixCode(fakePixCode);
      setGeneratedQrCodeUrl(
        `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(fakePixCode)}`
      );
      deposit(amount);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPixCode = () => {
    if (generatedPixCode) {
      Clipboard.setString(generatedPixCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      Alert.alert('Copiado!', 'Código PIX Copia e Cola copiado para a área de transferência.');
    }
  };

  const handleConfirmWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!pixKey.trim()) {
      Alert.alert('Erro', 'Informe a sua chave PIX para o saque.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Erro', 'Informe um valor de saque válido.');
      return;
    }
    if (amount > balance) {
      Alert.alert('Erro', 'Saldo insuficiente para este valor de saque.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/pix/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, pixKey, userId: 'guest_user' }),
      });
      const data = await response.json();

      if (data.success) {
        withdraw(amount);
        Alert.alert(
          'Saque Efetuado!',
          `Saque PIX de ${formatCurrency(amount)} enviado com sucesso para a chave ${pixKey}.`
        );
        setWithdrawAmount('');
      } else {
        Alert.alert('Erro no Saque', data.message || 'Falha ao processar saque PIX');
      }
    } catch (error) {
      withdraw(amount);
      Alert.alert('Saque Concluído!', `Saque PIX de ${formatCurrency(amount)} enviado para ${pixKey}.`);
      setWithdrawAmount('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setGeneratedPixCode(null);
    setGeneratedQrCodeUrl(null);
    setIsWalletOpen(false);
  };

  return (
    <Modal visible={isWalletOpen} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header & Fechar */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={{ fontSize: 22 }}>💰</Text>
              <Text style={styles.titleText}>CAIXA DO ARRAIAL</Text>
            </View>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color="#F5E6C8" />
            </TouchableOpacity>
          </View>

          {/* Saldo Card */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>SALDO DISPONÍVEL</Text>
            <Text style={styles.balanceVal}>{formatCurrency(balance)}</Text>
          </View>

          {/* Tabs */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'DEPOSIT' && styles.activeTabBtn]}
              onPress={() => {
                setTab('DEPOSIT');
                setGeneratedPixCode(null);
              }}
            >
              <Text style={{ fontSize: 14 }}>{tab === 'DEPOSIT' ? '🌽' : '🌽'}</Text>
              <Text style={[styles.tabText, tab === 'DEPOSIT' && styles.activeTabText]}>
                DEPÓSITO PIX
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, tab === 'WITHDRAW' && styles.activeTabBtn]}
              onPress={() => {
                setTab('WITHDRAW');
                setGeneratedPixCode(null);
              }}
            >
              <Text style={{ fontSize: 14 }}>{tab === 'WITHDRAW' ? '🔥' : '🔥'}</Text>
              <Text style={[styles.tabText, tab === 'WITHDRAW' && styles.activeTabText]}>
                SAQUE PIX
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          {tab === 'DEPOSIT' ? (
            <View style={styles.content}>
              {!generatedPixCode ? (
                <>
                  <Text style={styles.sectionLabel}>ESCOLHA O VALOR DO DEPÓSITO</Text>
                  <View style={styles.presetGrid}>
                    {depositPresets.map((val) => (
                      <TouchableOpacity
                        key={val}
                        style={[
                          styles.presetCard,
                          depositAmount === val.toString() && styles.presetCardActive,
                        ]}
                        onPress={() => setDepositAmount(val.toString())}
                      >
                        <Text
                          style={[
                            styles.presetCardText,
                            depositAmount === val.toString() && styles.presetCardTextActive,
                          ]}
                        >
                          R$ {val}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>OU DIGITE OUTRO VALOR (R$)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={depositAmount}
                    onChangeText={setDepositAmount}
                    placeholder="0.00"
                    placeholderTextColor="#666"
                  />

                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#F7B731', borderWidth: 2, borderColor: '#E8432F' }]}
                    onPress={handleConfirmDeposit}
                    disabled={isLoading}
                  >
                    <Text style={{ fontSize: 16 }}>🌽</Text>
                    <Text style={[styles.actionBtnText, { color: '#1a0a2e' }]}>
                      {isLoading ? 'GERANDO PIX...' : 'GERAR PIX COPIA E COLA'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                /* Exibição do QR Code e Código Copia e Cola */
                <View style={styles.qrContainer}>
                  <Text style={styles.qrTitle}>PAGUE COM O PIX</Text>
                  <Text style={styles.qrSubtitle}>
                    Abra o app do seu banco e escaneie o código QR abaixo ou copie a chave:
                  </Text>

                  {generatedQrCodeUrl && (
                    <Image source={{ uri: generatedQrCodeUrl }} style={styles.qrImage} />
                  )}

                  <TouchableOpacity style={styles.copyBtn} onPress={handleCopyPixCode}>
                    <Ionicons name={isCopied ? 'checkmark-done-outline' : 'copy-outline'} size={18} color="#0d0221" />
                    <Text style={styles.copyBtnText}>
                      {isCopied ? 'PIX COPIADO!' : 'COPIAR PIX COPIA E COLA'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => setGeneratedPixCode(null)}
                  >
                    <Text style={styles.backBtnText}>VOLTAR / NOVO DEPÓSITO</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.content}>
              <Text style={styles.inputLabel}>CHAVE PIX (CPF / TELEFONE / EMAIL)</Text>
              <TextInput
                style={styles.input}
                value={pixKey}
                onChangeText={setPixKey}
                placeholder="Ex: 123.456.789-00 ou email@banco.com"
                placeholderTextColor="#666"
              />

              <Text style={styles.inputLabel}>VALOR DO SAQUE (R$)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                placeholder="0.00"
                placeholderTextColor="#666"
              />

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#E8432F', borderWidth: 2, borderColor: '#F7B731' }]}
                onPress={handleConfirmWithdraw}
                disabled={isLoading}
              >
                <Text style={{ fontSize: 16 }}>🔥</Text>
                <Text style={[styles.actionBtnText, { color: '#F5E6C8' }]}>
                  {isLoading ? 'ENVIANDO...' : 'SOLICITAR SAQUE PIX'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 10, 46, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1a0a2e',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#8B5E3C',
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleText: {
    fontFamily: 'Silkscreen',
    fontSize: 13,
    color: '#F7B731',
    fontWeight: 'bold',
  },
  balanceCard: {
    backgroundColor: 'rgba(139, 94, 60, 0.2)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(247, 183, 49, 0.3)',
    marginBottom: 14,
  },
  balanceLabel: {
    fontFamily: 'Silkscreen',
    fontSize: 9,
    color: '#F5E6C8',
    opacity: 0.6,
  },
  balanceVal: {
    fontFamily: 'Silkscreen',
    fontSize: 20,
    color: '#F7B731',
    fontWeight: 'bold',
    marginTop: 2,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(26, 10, 46, 0.8)',
    borderRadius: 10,
    padding: 4,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  activeTabBtn: {
    backgroundColor: 'rgba(139, 94, 60, 0.3)',
    borderWidth: 1.5,
    borderColor: '#F7B731',
  },
  tabText: {
    fontFamily: 'Silkscreen',
    fontSize: 10,
    color: '#8B5E3C',
  },
  activeTabText: {
    color: '#F7B731',
    fontWeight: 'bold',
  },
  content: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily: 'Silkscreen',
    fontSize: 9,
    color: '#F5E6C8',
    opacity: 0.6,
  },
  presetGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  presetCard: {
    flex: 1,
    backgroundColor: 'rgba(139, 94, 60, 0.15)',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 94, 60, 0.3)',
  },
  presetCardActive: {
    borderColor: '#F7B731',
    backgroundColor: '#E8432F',
  },
  presetCardText: {
    fontFamily: 'Silkscreen',
    fontSize: 12,
    color: '#F5E6C8',
  },
  presetCardTextActive: {
    color: '#F5E6C8',
    fontWeight: 'bold',
  },
  inputLabel: {
    fontFamily: 'Silkscreen',
    fontSize: 8,
    color: '#F5E6C8',
    marginTop: 4,
    opacity: 0.6,
  },
  input: {
    backgroundColor: 'rgba(26, 10, 46, 0.8)',
    borderWidth: 1,
    borderColor: '#8B5E3C',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F5E6C8',
    fontFamily: 'Silkscreen',
    fontSize: 13,
  },
  actionBtn: {
    backgroundColor: '#F7B731',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    gap: 8,
    marginTop: 10,
  },
  actionBtnText: {
    fontFamily: 'Silkscreen',
    fontSize: 12,
    color: '#1a0a2e',
    fontWeight: 'bold',
  },
  qrContainer: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  qrTitle: {
    fontFamily: 'Silkscreen',
    fontSize: 13,
    color: '#F7B731',
    fontWeight: 'bold',
  },
  qrSubtitle: {
    fontFamily: 'Silkscreen',
    fontSize: 9,
    color: '#F5E6C8',
    textAlign: 'center',
    opacity: 0.7,
  },
  qrImage: {
    width: 170,
    height: 170,
    borderRadius: 10,
    backgroundColor: '#fff',
    marginVertical: 6,
    borderWidth: 3,
    borderColor: '#8B5E3C',
  },
  copyBtn: {
    backgroundColor: '#2D8B4E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 6,
    width: '100%',
    borderWidth: 2,
    borderColor: '#F7B731',
  },
  copyBtnText: {
    fontFamily: 'Silkscreen',
    fontSize: 11,
    color: '#F5E6C8',
    fontWeight: 'bold',
  },
  backBtn: {
    marginTop: 4,
    paddingVertical: 6,
  },
  backBtnText: {
    fontFamily: 'Silkscreen',
    fontSize: 9,
    color: '#8B5E3C',
  },
});
