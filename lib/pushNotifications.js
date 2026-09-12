import crypto from 'crypto';
import webpush from 'web-push';
import { db, FieldValue } from './firebase.js';
import { belongsToTenant } from './tenant.js';

const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const subject = String(process.env.VAPID_SUBJECT || 'mailto:suporte@blockerino.app').trim();
const configured = Boolean(publicKey && privateKey);

if (configured) webpush.setVapidDetails(subject, publicKey, privateKey);

export const pushStatus = { configured, publicKey: configured ? publicKey : '' };

export function pushSubscriptionId(uid, endpoint) {
  return crypto.createHash('sha256').update(`${uid}:${endpoint}`).digest('hex');
}

export async function savePushSubscription({ uid, tenantId, subscription, userAgent = '' }) {
  if (!configured) throw new Error('Notificações ainda não estão configuradas.');
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Inscrição de notificação inválida.');
  }
  const ref = db.collection('push_subscriptions').doc(pushSubscriptionId(uid, subscription.endpoint));
  await ref.set({
    affiliate_id: uid,
    tenant_id: tenantId,
    endpoint: String(subscription.endpoint),
    keys: {
      p256dh: String(subscription.keys.p256dh),
      auth: String(subscription.keys.auth)
    },
    user_agent: String(userAgent).slice(0, 300),
    active: true,
    updated_at: FieldValue.serverTimestamp(),
    created_at: FieldValue.serverTimestamp()
  }, { merge: true });
  return ref.id;
}

export async function removePushSubscription({ uid, endpoint }) {
  if (!endpoint) return;
  await db.collection('push_subscriptions').doc(pushSubscriptionId(uid, endpoint)).delete();
}

export async function sendAffiliateDepositNotification({ affiliateId, tenantId, depositId, event, amount }) {
  if (!configured || !affiliateId || !depositId) return { sent: 0, skipped: true };
  const affiliateDoc = await db.collection('users').doc(affiliateId).get();
  if (!affiliateDoc.exists || !belongsToTenant(affiliateDoc.data(), tenantId)) return { sent: 0, skipped: true };

  const eventId = `${depositId}_${event}`;
  const eventRef = db.collection('affiliate_notification_events').doc(eventId);
  const claimed = await db.runTransaction(async transaction => {
    const current = await transaction.get(eventRef);
    if (current.exists && current.data().status === 'sent') return false;
    transaction.set(eventRef, {
      affiliate_id: affiliateId,
      tenant_id: tenantId,
      deposit_id: depositId,
      event,
      amount,
      status: 'processing',
      attempts: FieldValue.increment(1),
      updated_at: FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  });
  if (!claimed) return { sent: 0, skipped: true };

  const snapshot = await db.collection('push_subscriptions').where('affiliate_id', '==', affiliateId).get();
  const subscriptions = snapshot.docs.filter(doc => doc.data().active !== false && belongsToTenant(doc.data(), tenantId));
  const value = (Math.max(0, Number(amount) || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const paid = event === 'deposit_paid';
  const payload = JSON.stringify({
    title: paid ? 'Venda confirmada! 💸' : 'Novo PIX gerado ⚡',
    body: paid
      ? `Um cliente do seu link pagou ${value}. Sua comissão já foi registrada.`
      : `Um cliente do seu link gerou um PIX de ${value}.`,
    tag: eventId,
    url: '/affiliate'
  });

  let sent = 0;
  await Promise.all(subscriptions.map(async doc => {
    const data = doc.data();
    try {
      await webpush.sendNotification({ endpoint: data.endpoint, keys: data.keys }, payload, {
        TTL: 60 * 60,
        urgency: paid ? 'high' : 'normal'
      });
      sent++;
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) await doc.ref.delete();
      else console.warn(`[Push] Falha na inscrição ${doc.id}:`, error.message);
    }
  }));

  await eventRef.set({
    status: subscriptions.length === 0 || sent > 0 ? 'sent' : 'failed',
    subscriptions: subscriptions.length,
    sent,
    completed_at: FieldValue.serverTimestamp()
  }, { merge: true });
  return { sent, subscriptions: subscriptions.length };
}
