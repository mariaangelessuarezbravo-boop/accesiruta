/* ============================================
   AccesiRuta — Firebase Configuration
   Replace placeholder values with your real Firebase project config.
   Until configured, the app runs in "demo mode" with localStorage.
   ============================================ */

var FirebaseConfig = (function () {
  'use strict';

  // =============================================
  // FIREBASE PROJECT CONFIGURATION
  // Replace these placeholder values with your
  // real Firebase project settings from:
  // https://console.firebase.google.com/ > Project Settings > General
  // =============================================
  var config = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID_HERE",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:0000000000000000000000"
  };

  var _initialized = false;
  var _db = null;
  var _auth = null;

  /**
   * Check if Firebase has been configured with real values.
   * Returns false if placeholder values are still present.
   */
  function isConfigured() {
    return (
      config.apiKey !== "YOUR_API_KEY_HERE" &&
      config.projectId !== "YOUR_PROJECT_ID_HERE" &&
      config.apiKey.length > 10
    );
  }

  /**
   * Initialize Firebase app, auth, and firestore.
   * Only runs once. Returns true if successful, false otherwise.
   */
  function initialize() {
    if (_initialized) return true;
    if (!isConfigured()) {
      console.log('[Firebase] No configurado — modo demo activo');
      return false;
    }

    try {
      if (typeof firebase === 'undefined') {
        console.warn('[Firebase] SDK no cargado');
        return false;
      }

      // Initialize Firebase app (compat mode)
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }

      _auth = firebase.auth();
      _db = firebase.firestore();

      // Enable offline persistence for Firestore
      _db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
        if (err.code === 'failed-precondition') {
          console.warn('[Firestore] Persistencia no disponible (varias pestanas abiertas)');
        } else if (err.code === 'unimplemented') {
          console.warn('[Firestore] Persistencia no soportada en este navegador');
        }
      });

      _initialized = true;
      console.log('[Firebase] Inicializado correctamente');
      return true;
    } catch (e) {
      console.error('[Firebase] Error al inicializar:', e);
      return false;
    }
  }

  /**
   * Get Firestore database instance (or null if not configured)
   */
  function getDb() {
    if (!_initialized) initialize();
    return _db;
  }

  /**
   * Get Firebase Auth instance (or null if not configured)
   */
  function getAuth() {
    if (!_initialized) initialize();
    return _auth;
  }

  /**
   * Sign in with Google popup
   * Returns a Promise that resolves with the user credential
   */
  function signInWithGoogle() {
    var auth = getAuth();
    if (!auth) {
      return Promise.reject(new Error('Firebase no configurado'));
    }
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return auth.signInWithPopup(provider);
  }

  /**
   * Sign out the current user
   */
  function signOut() {
    var auth = getAuth();
    if (!auth) {
      return Promise.resolve();
    }
    return auth.signOut();
  }

  /**
   * Get the currently signed-in user (or null)
   */
  function getCurrentUser() {
    var auth = getAuth();
    return auth ? auth.currentUser : null;
  }

  /**
   * Listen for auth state changes
   * callback receives (user) — user object or null
   */
  function onAuthStateChanged(callback) {
    var auth = getAuth();
    if (auth) {
      return auth.onAuthStateChanged(callback);
    }
    // Not configured, call with null immediately
    callback(null);
    return function () {}; // no-op unsubscribe
  }

  /* --- Public API --- */
  return {
    isConfigured: isConfigured,
    initialize: initialize,
    getDb: getDb,
    getAuth: getAuth,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getCurrentUser: getCurrentUser,
    onAuthStateChanged: onAuthStateChanged,
  };
})();
