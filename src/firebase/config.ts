import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAAOugq7KQEMfaF8Zk_u-TETKwhAWMBFmg",
  authDomain: "harcliktakip.firebaseapp.com",
  projectId: "harcliktakip",
  storageBucket: "harcliktakip.firebasestorage.app",
  messagingSenderId: "522485304348",
  appId: "1:522485304348:web:04ff1979c6f39dbef9e3d9"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;