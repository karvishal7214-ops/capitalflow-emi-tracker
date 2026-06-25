/**
 * Firebase Configuration for CapitalFlow EMI Tracker
 * Project: EMI tracker (emi-tracker-c7d25)
 * Project Number: 317390620918
 */

const firebaseConfig = {
  apiKey: "AIzaSyAiy2jcxhgX5tzJTMA4XfT2c67HfHg8Ko4",
  authDomain: "emi-tracker-c7d25.firebaseapp.com",
  projectId: "emi-tracker-c7d25",
  storageBucket: "emi-tracker-c7d25.firebasestorage.app",
  messagingSenderId: "317390620918",
  appId: "1:317390620918:web:e103088723b172e0ae44d7",
  measurementId: "G-368QYGGWXB"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export Firebase services
const auth = firebase.auth();
const db = firebase.firestore();

// Set language for phone auth (SMS will be in this language)
auth.languageCode = 'en';
