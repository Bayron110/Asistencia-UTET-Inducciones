import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  update,
  remove,
  push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBrQcB6YN3FY2kvkthvtFjmRip1vz6l2Fg",
  authDomain: "inducciones-grupos.firebaseapp.com",
  databaseURL: "https://inducciones-grupos-default-rtdb.firebaseio.com",
  projectId: "inducciones-grupos",
  storageBucket: "inducciones-grupos.firebasestorage.app",
  messagingSenderId: "870909696149",
  appId: "1:870909696149:web:64276b9facd0c12c12e39c"
};

const APP_NAME = "induccionesGruposApp";

const app = getApps().some(app => app.name === APP_NAME)
  ? getApp(APP_NAME)
  : initializeApp(firebaseConfig, APP_NAME);

const db = getDatabase(app);

export {
  db,
  ref,
  set,
  get,
  onValue,
  update,
  remove,
  push
};