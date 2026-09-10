import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAk4uXJR1VQz9B8sDp1IR8XDBkRAtVpDUo",
  authDomain: "browser-3ae3d.firebaseapp.com",
  projectId: "browser-3ae3d",
  storageBucket: "browser-3ae3d.firebasestorage.app",
  messagingSenderId: "1075247305771",
  appId: "1:1075247305771:web:fc706fbe8a8ef538cec66e"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
