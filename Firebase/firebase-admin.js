import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  remove,
  set,
  get,
  update,
  push,
  child
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDpnxali4mzuBlRS5W1agtoaYmshnJqmuE",
  authDomain: "registro-utet-estudiantes.firebaseapp.com",
  projectId: "registro-utet-estudiantes",
  storageBucket: "registro-utet-estudiantes.firebasestorage.app",
  messagingSenderId: "354665324174",
  appId: "1:354665324174:web:59d7cb0dba476d78c4f3df",
  measurementId: "G-LPTHYRRGCP",
  databaseURL: "https://registro-utet-estudiantes-default-rtdb.firebaseio.com/"
};

// Usa la app DEFAULT
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const db = getDatabase(app);

export {
  db,
  ref,
  onValue,
  remove,
  set,
  get,
  update,
  push,
  child
};