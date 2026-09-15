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

let app;
let db: any;
let auth: any;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
}

export { app, db, auth };
