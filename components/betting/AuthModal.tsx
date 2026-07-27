import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import { useBetting } from '@/hooks/useBettingState';

export function AuthModal() {
  const { isAuthOpen, setIsAuthOpen, saveToken, setUser, setIsWalletOpen } = useBetting();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('register');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMsg('Preencha o e-mail e a senha.');
      return;
    }
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no login');

      saveToken(data.token);
      setUser(data.user);
      setIsAuthOpen(false);
      setIsWalletOpen(true); // Abre direto a caixa de depósito para o lead
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao realizar login');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username || !email || !password) {
      setErrorMsg('Preencha todos os campos.');
      return;
    }
    setLoading(true);
    setErrorMsg('');

    const ref = typeof window !== 'undefined' ? localStorage.getItem('ref_code') : null;
    const subref = typeof window !== 'undefined' ? localStorage.getItem('subref_code') : null;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, referred_by: ref, sub_referred_by: subref }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no cadastro');

      saveToken(data.token);
      setUser(data.user);
      setIsAuthOpen(false);
      setIsWalletOpen(true); // Abre direto o PIX de depósito de 300% bônus
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={isAuthOpen} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setIsAuthOpen(false)}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.title}>🎪 BLOCKERINO BET</Text>
          <View style={styles.bonusBadge}>
            <Text style={styles.bonusBadgeText}>🎁 BÔNUS 300%: R$ 20 ➔ R$ 60</Text>
          </View>

          {/* Abas Entrar / Cadastrar */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'register' && styles.activeTabBtn]}
              onPress={() => { setActiveTab('register'); setErrorMsg(''); }}
            >
              <Text style={[styles.tabText, activeTab === 'register' && styles.activeTabText]}>
                CADASTRAR 🚀
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'login' && styles.activeTabBtn]}
              onPress={() => { setActiveTab('login'); setErrorMsg(''); }}
            >
              <Text style={[styles.tabText, activeTab === 'login' && styles.activeTabText]}>
                ENTRAR 🔑
              </Text>
            </TouchableOpacity>
          </View>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          {activeTab === 'register' ? (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Nome de Usuário"
                placeholderTextColor="rgba(245,230,200,0.5)"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder="Seu E-mail"
                placeholderTextColor="rgba(245,230,200,0.5)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder="Criar Senha"
                placeholderTextColor="rgba(245,230,200,0.5)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.submitBtn, styles.regBtn]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>CRIAR CONTA E ATIVAR 300% 🌽</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Seu E-mail"
                placeholderTextColor="rgba(245,230,200,0.5)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder="Sua Senha"
                placeholderTextColor="rgba(245,230,200,0.5)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.submitBtn, styles.loginBtn]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>ENTRAR NA CONTA 🚀</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1a0a2e',
    borderWidth: 2,
    borderColor: '#F7B731',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 6,
  },
  closeBtnText: {
    color: '#F5E6C8',
    fontSize: 16,
    fontWeight: 'bold',
  },
  title: {
    fontFamily: 'Silkscreen',
    fontSize: 20,
    color: '#F7B731',
    marginBottom: 4,
  },
  bonusBadge: {
    backgroundColor: '#2D8B4E',
    borderWidth: 1,
    borderColor: '#F7B731',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 14,
  },
  bonusBadgeText: {
    fontFamily: 'Silkscreen',
    fontSize: 9,
    color: '#fff',
    fontWeight: 'bold',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    backgroundColor: 'rgba(139, 94, 60, 0.3)',
    borderWidth: 1.5,
    borderColor: 'rgba(247, 183, 49, 0.3)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  activeTabBtn: {
    backgroundColor: '#F7B731',
    borderColor: '#E8432F',
  },
  tabText: {
    fontFamily: 'Silkscreen',
    fontSize: 10,
    color: '#F5E6C8',
  },
  activeTabText: {
    color: '#1a0a2e',
    fontWeight: 'bold',
  },
  errorText: {
    fontFamily: 'Silkscreen',
    fontSize: 9,
    color: '#E8432F',
    marginBottom: 8,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    gap: 10,
  },
  input: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderWidth: 1.5,
    borderColor: '#8B5E3C',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F5E6C8',
    fontFamily: 'Silkscreen',
    fontSize: 11,
  },
  submitBtn: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  regBtn: {
    backgroundColor: '#2D8B4E',
    borderWidth: 1.5,
    borderColor: '#F7B731',
  },
  loginBtn: {
    backgroundColor: '#F7B731',
    borderWidth: 1.5,
    borderColor: '#E8432F',
  },
  submitBtnText: {
    fontFamily: 'Silkscreen',
    fontSize: 10.5,
    color: '#fff',
    fontWeight: 'bold',
  },
});
