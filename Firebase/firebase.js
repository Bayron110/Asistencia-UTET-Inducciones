import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyANtWmjXdlHkf-LO4t2gtpyymmjeEr2emI",
  authDomain: "repaso-fire-d8ceb.firebaseapp.com",
  databaseURL: "https://repaso-fire-d8ceb-default-rtdb.firebaseio.com",
  projectId: "repaso-fire-d8ceb",
  storageBucket: "repaso-fire-d8ceb.firebasestorage.app",
  messagingSenderId: "1080713449199",
  appId: "1:1080713449199:web:a94fd6c6e26766b4e2551a"
};

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

const db = getDatabase(app);

export { db, ref, get, set, onValue, remove };