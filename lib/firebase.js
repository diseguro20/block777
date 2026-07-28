import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue as FirestoreFieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const projectId = process.env.FIREBASE_PROJECT_ID || 'block777';

let app;

try {
  if (!getApps().length) {
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      app = initializeApp({
        credential: cert({
          projectId: projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      app = initializeApp({
        projectId: projectId,
      });
    }
  } else {
    app = getApps()[0];
  }
} catch (e) {
  console.warn('Firebase init warning:', e.message);
}

let dbInstance;
try {
  dbInstance = getFirestore(app);
} catch (e) {
  dbInstance = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => ({}) }),
        set: async () => {},
        update: async () => {},
        delete: async () => {}
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
}

let authInstance;
try {
  authInstance = getAuth(app);
} catch (e) {}

export const db = dbInstance;
export const auth = authInstance;
export const FieldValue = FirestoreFieldValue || {
  serverTimestamp: () => new Date(),
  increment: (n) => n
};
