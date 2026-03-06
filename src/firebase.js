// src/firebase.js
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
    apiKey: "AIzaSyCnTyXEg2JEoj3AuCEv3xrEJkeBRROYuVw",
    authDomain: "polar-scarab-473414-n9.firebaseapp.com",
    projectId: "polar-scarab-473414-n9",
    storageBucket: "polar-scarab-473414-n9.firebasestorage.app",
    messagingSenderId: "293136892477",
    appId: "1:293136892477:web:c6e20b4793972343ab6054"
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export default app
