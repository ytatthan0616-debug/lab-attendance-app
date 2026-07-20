// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBFd-sqzINQ8l6dWlICusq7CU0WmF3RBDk",
  authDomain: "lab-attendance-app-3e275.firebaseapp.com",
  databaseURL: "https://lab-attendance-app-3e275-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lab-attendance-app-3e275",
  storageBucket: "lab-attendance-app-3e275.firebasestorage.app",
  messagingSenderId: "599931511302",
  appId: "1:599931511302:web:b227230fa729e176439987",
  measurementId: "G-5CQ3LJFBCV"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);