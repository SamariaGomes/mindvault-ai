import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAI, GoogleAIBackend } from "firebase/ai";

const firebaseConfig = {
  apiKey: "AIzaSyCZFo5sdQFYSm5XUPMx_axAU8vr8LcnaLY",
  authDomain: "mindvault-hybrid-ai.firebaseapp.com",
  projectId: "mindvault-hybrid-ai",
  storageBucket: "mindvault-hybrid-ai.firebasestorage.app",
  messagingSenderId: "453373632070",
  appId: "1:453373632070:web:8628d92d1f5c0fe7bfb447",
  measurementId: "G-XB6Q8H02SH"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const ai = getAI(app, { backend: new GoogleAIBackend() });

export const ensureAuth = async () => {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  return auth.currentUser!;
};