/* ============================================
   AccesiRuta — Reports Module
   Firebase Firestore (when configured) or
   localStorage fallback for accessibility reports
   ============================================ */

var Reports = (function () {
  'use strict';

  var STORAGE_KEY = 'accesiruta_reports';
  var FIRESTORE_COLLECTION = 'reports';
  var selectedType = null;
  var selectedRating = 0;

  // Local cache of reports (used for both modes)
  var cachedReports = null;
  // Firestore unsubscribe function
  var unsubscribeFirestore = null;

  var TYPE_LABELS = {
    rampa: 'Rampa accesible',
    escaleras: 'Escaleras',
    banco: 'Banco / Zona de descanso',
    pendiente: 'Pendiente pronunciada',
    obstaculo: 'Obstaculo en la via',
  };

  /* --- Check if Firestore is available --- */
  function useFirestore() {
    return (
      typeof FirebaseConfig !== 'undefined' &&
      FirebaseConfig.isConfigured() &&
      FirebaseConfig.getDb() !== null
    );
  }

  /* --- Init --- */
  function init() {
    setupTypeButtons();
    setupStarRating();
    setupSubmit();

    // If Firestore is available, start listening for real-time updates
    if (useFirestore()) {
      startFirestoreListener();
    }
  }

  /* --- Firestore Real-Time Listener --- */
  function startFirestoreListener() {
    var db = FirebaseConfig.getDb();
    if (!db) return;

    // Unsubscribe previous listener if any
    if (unsubscribeFirestore) {
      unsubscribeFirestore();
    }

    try {
      unsubscribeFirestore = db.collection(FIRESTORE_COLLECTION)
        .orderBy('timestamp', 'desc')
        .limit(200)
        .onSnapshot(function (snapshot) {
          var reports = [];
          snapshot.forEach(function (doc) {
            var data = doc.data();
            data.id = doc.id;
            reports.push(data);
          });
          // Reverse so oldest first (consistent with localStorage order)
          cachedReports = reports.reverse();

          // Refresh UI if the app is loaded
          if (typeof App !== 'undefined' && typeof App.populateHome === 'function') {
            App.populateHome();
          }
          if (typeof Profile !== 'undefined' && typeof Profile.refresh === 'function') {
            Profile.refresh();
          }
          if (typeof MapModule !== 'undefined' && typeof MapModule.loadReportMarkers === 'function') {
            MapModule.loadReportMarkers();
          }
        }, function (err) {
          console.warn('[Firestore] Error en listener:', err);
          // Fall back to local cache
          cachedReports = null;
        });
    } catch (e) {
      console.warn('[Firestore] No se pudo iniciar listener:', e);
    }
  }

  /* --- Type Selection --- */
  function setupTypeButtons() {
    var btns = document.querySelectorAll('.report-type-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        selectedType = btn.getAttribute('data-type');
      });
    });
  }

  /* --- Star Rating --- */
  function setupStarRating() {
    var stars = document.querySelectorAll('.star-btn');
    var label = document.getElementById('rating-label');

    var ratingTexts = {
      1: 'Muy mala accesibilidad',
      2: 'Mala accesibilidad',
      3: 'Accesibilidad regular',
      4: 'Buena accesibilidad',
      5: 'Excelente accesibilidad',
    };

    stars.forEach(function (star) {
      star.addEventListener('click', function () {
        selectedRating = parseInt(star.getAttribute('data-value'));
        stars.forEach(function (s) {
          var val = parseInt(s.getAttribute('data-value'));
          if (val <= selectedRating) {
            s.classList.add('filled');
            s.textContent = '\u2605';
          } else {
            s.classList.remove('filled');
            s.textContent = '\u2606';
          }
        });
        if (label) {
          label.textContent = ratingTexts[selectedRating] || '';
        }
      });
    });
  }

  /* --- Submit --- */
  function setupSubmit() {
    var form = document.getElementById('report-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitReport();
    });
  }

  function submitReport() {
    if (!selectedType) {
      App.showToast('Selecciona un tipo de reporte');
      return;
    }
    if (selectedRating === 0) {
      App.showToast('Selecciona una valoracion');
      return;
    }

    var comment = document.getElementById('report-comment');
    var commentText = comment ? comment.value.trim() : '';
    var pos = App.getUserPosition();

    // Get user info for the report
    var userName = typeof App !== 'undefined' ? App.getUserName() : 'Usuario';
    var userPhoto = typeof App !== 'undefined' ? App.getUserPhoto() : null;
    var userUid = typeof App !== 'undefined' ? App.getUserUid() : 'anonymous';

    var report = {
      id: generateId(),
      type: selectedType,
      rating: selectedRating,
      comment: commentText,
      lat: pos.lat,
      lng: pos.lng,
      timestamp: Date.now(),
      userName: userName,
      userPhoto: userPhoto,
      userUid: userUid,
    };

    saveReport(report);

    // Show success
    var formSection = document.getElementById('report-form-section');
    var successSection = document.getElementById('report-success');
    if (formSection) formSection.style.display = 'none';
    if (successSection) successSection.style.display = 'flex';

    // Update sync indicator on success screen
    if (typeof App !== 'undefined') App.updateSyncIndicators();

    // Update profile stats
    if (typeof Profile !== 'undefined') Profile.addPoints(10);

    var savedMsg = useFirestore() ? 'Reporte guardado en la nube! +10 puntos' : 'Reporte guardado! +10 puntos';
    App.showToast(savedMsg);

    // Reset form after delay
    setTimeout(function () {
      resetForm();
      if (formSection) formSection.style.display = 'block';
      if (successSection) successSection.style.display = 'none';
    }, 3000);
  }

  function resetForm() {
    selectedType = null;
    selectedRating = 0;

    var btns = document.querySelectorAll('.report-type-btn');
    btns.forEach(function (b) { b.classList.remove('selected'); });

    var stars = document.querySelectorAll('.star-btn');
    stars.forEach(function (s) {
      s.classList.remove('filled');
      s.textContent = '\u2606';
    });

    var label = document.getElementById('rating-label');
    if (label) label.textContent = 'Toca una estrella para valorar';

    var comment = document.getElementById('report-comment');
    if (comment) comment.value = '';
  }

  /* --- Storage --- */
  function getAll() {
    // If we have a Firestore cache, use it
    if (useFirestore() && cachedReports !== null) {
      return cachedReports;
    }

    // Otherwise use localStorage
    return getFromLocalStorage();
  }

  function getFromLocalStorage() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveReport(report) {
    // Always save to localStorage as backup
    var reports = getFromLocalStorage();
    reports.push(report);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));

    // Also save to Firestore if available
    if (useFirestore()) {
      var db = FirebaseConfig.getDb();
      if (db) {
        // Use the report ID as the document ID
        var docData = {
          type: report.type,
          rating: report.rating,
          comment: report.comment,
          lat: report.lat,
          lng: report.lng,
          timestamp: report.timestamp,
          userName: report.userName || 'Usuario',
          userPhoto: report.userPhoto || null,
          userUid: report.userUid || 'anonymous',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        db.collection(FIRESTORE_COLLECTION).doc(report.id).set(docData)
          .then(function () {
            console.log('[Firestore] Reporte guardado:', report.id);
          })
          .catch(function (err) {
            console.warn('[Firestore] Error guardando reporte:', err);
            App.showToast('Guardado localmente (sin conexion a la nube)');
          });
      }
    }
  }

  function getByProximity(lat, lng, radiusKm) {
    radiusKm = radiusKm || 5;
    var all = getAll();
    return all.filter(function (r) {
      var dist = haversineDistance(lat, lng, r.lat, r.lng);
      return dist <= radiusKm;
    });
  }

  function getCount() {
    return getAll().length;
  }

  /* --- Helpers --- */
  function generateId() {
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
  }

  function haversineDistance(lat1, lng1, lat2, lng2) {
    var R = 6371; // Earth radius in km
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function toRad(deg) {
    return deg * (Math.PI / 180);
  }

  /* --- Public API --- */
  return {
    init: init,
    getAll: getAll,
    getCount: getCount,
    getByProximity: getByProximity,
    saveReport: saveReport,
    useFirestore: useFirestore,
  };
})();
