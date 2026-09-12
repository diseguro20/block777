import assert from 'node:assert/strict';
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
process.env.VAPID_SUBJECT = 'mailto:test@blockerino.app';

const { pushStatus, pushSubscriptionId } = await import('../lib/pushNotifications.js');
assert.equal(pushStatus.configured, true);
assert.equal(pushStatus.publicKey, keys.publicKey);
assert.equal(pushSubscriptionId('affiliate-1', 'https://push.test/one'), pushSubscriptionId('affiliate-1', 'https://push.test/one'));
assert.notEqual(pushSubscriptionId('affiliate-1', 'https://push.test/one'), pushSubscriptionId('affiliate-2', 'https://push.test/one'));
console.log('Affiliate push notification configuration validated.');
