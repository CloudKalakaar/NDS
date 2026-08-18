// NDS - Student & Fee Tracker - Core Application Logic

// ==================== STATE MANAGEMENT ====================
let state = {
  masterName: '',
  students: [],
  payments: [],
  attendance: [],    // [{ date:'YYYY-MM-DD', studentId, status:'present'|'absent' }]
  holidays: [],      // ['YYYY-MM-DD', ...]
  autoSunday: false, // auto-mark every Sunday as holiday
  batchPricing: {
    "Kids batch (batch 1)": { "1m": 1500, "3m": 4000, "6m": 7500, "12m": 14000 },
    "Intermediate (batch 2)": { "1m": 2000, "3m": 5500, "6m": 10000, "12m": 19000 },
    "Advanced batch (batch 3)": { "1m": 2500, "3m": 7000, "6m": 13000, "12m": 25000 },
    "Gymnastics batch": { "1m": 1800, "3m": 5000, "6m": 9000, "12m": 17000 },
    "Zumba batch": { "1m": 1500, "3m": 4000, "6m": 7500, "12m": 14000 }
  },
  gdrive: {
    clientId: '434441892966-203633m5fa73di5u7al48o4niilu1obh.apps.googleusercontent.com',
    autoSync: false,
    accessToken: '',
    tokenExpiry: 0,
    lastSyncTime: null,
    fileId: null,
    userEmail: ''
  }
};

// Default Database Schema
const DEFAULT_STATE = {
  masterName: '',
  students: [],
  payments: [],
  attendance: [],
  holidays: [],
  autoSunday: false,
  batchPricing: {
    "Kids batch (batch 1)": { "1m": 1500, "3m": 4000, "6m": 7500, "12m": 14000 },
    "Intermediate (batch 2)": { "1m": 2000, "3m": 5500, "6m": 10000, "12m": 19000 },
    "Advanced batch (batch 3)": { "1m": 2500, "3m": 7000, "6m": 13000, "12m": 25000 },
    "Gymnastics batch": { "1m": 1800, "3m": 5000, "6m": 9000, "12m": 17000 },
    "Zumba batch": { "1m": 1500, "3m": 4000, "6m": 7500, "12m": 14000 }
  },
  gdrive: {
    clientId: '434441892966-203633m5fa73di5u7al48o4niilu1obh.apps.googleusercontent.com',
    autoSync: false,
    accessToken: '',
    tokenExpiry: 0,
    lastSyncTime: null,
    fileId: null,
    userEmail: ''
  }
};

// DB Constants
const LOCAL_STORAGE_KEY = 'nds_tracker_db_v2'; // Bump database namespace to cleanly handle date-to-date transition

// Current View Tracker
let currentView = 'dashboard';

// Pull To Refresh Variables
let pullStartY = 0;
let pullMoveY = 0;
let isPulling = false;
const PULL_THRESHOLD = 80;
const PULL_MAX = 140;

// Selected Student for Detail Modal / Actions
let selectedStudentId = null;

// Toggle state for outstanding fees list ('current' or 'history')
let pendingFilterMode = 'current';

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  if (document.documentElement) document.documentElement.scrollTop = 0;
  
  initApp();
  registerServiceWorker();
  initViewRouting();
  initFormsAndModals();
  initDataAdministration();
  initGoogleDrive();
  initPullToRefresh();
  initDashboardToggle();
  initAttendance();
  initHolidaySettings();
});

// Initialize Dashboard Outstanding Toggle Pills
function initDashboardToggle() {
  const btnCurrent = document.getElementById('btn-toggle-pending-current');
  const btnHistory = document.getElementById('btn-toggle-pending-history');
  
  if (btnCurrent && btnHistory) {
    btnCurrent.addEventListener('click', () => {
      pendingFilterMode = 'current';
      btnCurrent.classList.add('active');
      btnHistory.classList.remove('active');
      renderDashboard();
    });
    
    btnHistory.addEventListener('click', () => {
      pendingFilterMode = 'history';
      btnHistory.classList.add('active');
      btnCurrent.classList.remove('active');
      renderDashboard();
    });
  }
}

// Load DB State from LocalStorage
function initApp() {
  const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (storedData) {
    try {
      state = JSON.parse(storedData);
      // Ensure arrays and new fields exist
      state.students = state.students || [];
      state.payments = state.payments || [];
      state.masterName = state.masterName || '';
      state.attendance = state.attendance || [];
      state.holidays = state.holidays || [];
      state.autoSunday = state.autoSunday || false;
      if (!state.batchPricing) state.batchPricing = { ...DEFAULT_STATE.batchPricing };
      if (!state.gdrive) state.gdrive = { ...DEFAULT_STATE.gdrive };
      if (!state.gdrive.clientId) state.gdrive.clientId = DEFAULT_STATE.gdrive.clientId;
    } catch (e) {
      console.error('Error parsing stored database, resetting to default.', e);
      state = { ...DEFAULT_STATE };
    }
  } else {
    // Check if legacy database (db namespace 1) exists, migrate it cleanly if available
    const legacyData = localStorage.getItem('nds_tracker_db');
    if (legacyData) {
      try {
        const legacyState = JSON.parse(legacyData);
        state = {
          masterName: legacyState.masterName || '',
          students: legacyState.students || [],
          payments: legacyState.payments || [],
          batchPricing: { ...DEFAULT_STATE.batchPricing },
          gdrive: { ...DEFAULT_STATE.gdrive }
        };
        saveState();
        // Clear old key
        localStorage.removeItem('nds_tracker_db');
        console.log('[NDS Schema Migration] Successfully migrated to date-to-date schema!');
      } catch (err) {
        console.error('[NDS Schema Migration] Failed to parse legacy database', err);
        state = { ...DEFAULT_STATE };
      }
    } else {
      state = { ...DEFAULT_STATE };
    }
  }

  // Check Onboarding status
  const onboardingModal = document.getElementById('onboarding-modal');
  if (!state.masterName) {
    onboardingModal.style.display = 'flex';
  } else {
    onboardingModal.style.display = 'none';
    updateMasterGreeting();
    renderActiveView();
  }
  
  // Set up date inputs to default to today's date
  const today = new Date().toISOString().split('T')[0];
  const paymentDateInput = document.getElementById('payment-date');
  if (paymentDateInput) paymentDateInput.value = today;
  
  const studentAdmissionInput = document.getElementById('student-admission');
  if (studentAdmissionInput) studentAdmissionInput.value = today;

  // Initialize Settings Pricing Inputs on startup
  initSettingsPricingSelector();
}

// Save DB State to LocalStorage & trigger debounced auto-sync
function saveState() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  triggerAutoSyncGoogleDrive();
}

// Update Master Name in Header and Settings
function updateMasterGreeting() {
  const masterGreetName = document.getElementById('master-greet-name');
  const settingsMasterName = document.getElementById('settings-master-name');
  
  if (masterGreetName) {
    masterGreetName.textContent = state.masterName || 'Master';
  }
  if (settingsMasterName) {
    settingsMasterName.textContent = state.masterName || '';
    settingsMasterName.value = state.masterName || '';
  }
}

// ==================== SERVICE WORKER & HARD REFRESH ====================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[Service Worker] Registered successfully:', reg.scope);
          
          // Check update status for developer info
          const cacheStatusText = document.getElementById('cache-status-text');
          if (cacheStatusText) {
            cacheStatusText.textContent = reg.active ? 'Offline Ready (Cached)' : 'Caching Assets...';
            cacheStatusText.className = 'info-value text-green';
          }
          
          reg.addEventListener('updatefound', () => {
            const installingWorker = reg.installing;
            if (installingWorker == null) return;
            
            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('[Service Worker] New update available! Swipe down to apply.');
                  showToast('New studio updates loaded! Swipe down to refresh.', 'warning');
                } else {
                  console.log('[Service Worker] Content cached for offline use.');
                }
              }
            });
          });
        })
        .catch((err) => {
          console.error('[Service Worker] Registration failed:', err);
          const cacheStatusText = document.getElementById('cache-status-text');
          if (cacheStatusText) {
            cacheStatusText.textContent = 'Unavailable (Offline Mode Enabled)';
            cacheStatusText.className = 'info-value';
          }
        });
    });
  }
}

// Hard Purge Caches & Hard Reload
async function triggerHardRefresh() {
  showToast('Purging cache & sync code...', 'warning');
  
  // Unregister Service Workers
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let registration of registrations) {
        await registration.unregister();
        console.log('[Service Worker] Unregistered active worker');
      }
    } catch (e) {
      console.error('[Hard Refresh] Failed to unregister service worker:', e);
    }
  }

  // Delete all Caches
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[Hard Refresh] Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    } catch (e) {
      console.error('[Hard Refresh] Failed to clear caches:', e);
    }
  }

  // Force Hard Reload from Server bypassing local browser cache
  setTimeout(() => {
    window.location.reload(true);
  }, 1000);
}

// Pull to Refresh Touch Gesture Management
function initPullToRefresh() {
  const pullIndicator = document.getElementById('pull-to-refresh');
  const refreshText = document.getElementById('pull-refresh-text');
  const mainContent = document.querySelector('.app-main-content');
  
  if (!pullIndicator || !mainContent) return;

  mainContent.addEventListener('touchstart', (e) => {
    // Only trigger pull-to-refresh if we are at the very top of the scrollable container
    if (mainContent.scrollTop === 0) {
      pullStartY = e.touches[0].pageY;
      isPulling = true;
      pullIndicator.style.transition = 'none'; // Disable transition during drag
    }
  }, { passive: true });

  mainContent.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    
    pullMoveY = e.touches[0].pageY;
    const pullDistance = pullMoveY - pullStartY;
    
    if (pullDistance > 0) {
      // Prevent standard bounce scrolling on mobile if possible
      if (e.cancelable) e.preventDefault();
      
      // Apply dampening formula so it gets harder to pull down
      const dampenedDistance = Math.min(Math.pow(pullDistance, 0.85), PULL_MAX);
      
      // Position the pull indicator (starts fully hidden at -80px)
      const translateY = -80 + dampenedDistance;
      pullIndicator.style.transform = `translateY(${translateY}px)`;
      
      if (dampenedDistance >= PULL_THRESHOLD) {
        refreshText.textContent = 'Release to sync latest code!';
        pullIndicator.querySelector('.spinner').style.transform = `rotate(${pullDistance * 2}deg)`;
      } else {
        refreshText.textContent = 'Pull down to force update...';
      }
    }
  }, { passive: false });

  mainContent.addEventListener('touchend', () => {
    if (!isPulling) return;
    isPulling = false;
    
    // Safety guard to ensure finalDistance is never negative (prevents Math.pow returning NaN)
    const finalDistance = Math.max(0, pullMoveY - pullStartY);
    const dampenedDistance = Math.min(Math.pow(finalDistance, 0.85), PULL_MAX);
    
    pullIndicator.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    
    if (dampenedDistance >= PULL_THRESHOLD) {
      // Pin at the top showing the spinner
      pullIndicator.style.transform = 'translateY(0px)';
      refreshText.textContent = 'Clearing cache & reloading...';
      triggerHardRefresh();
    } else {
      // Slip back up
      pullIndicator.style.transform = 'translateY(-100%)';
    }
    
    // Reset trackers
    pullStartY = 0;
    pullMoveY = 0;
  });
  
  // Connect quick refresh button in header
  const quickRefreshBtn = document.getElementById('quick-refresh-btn');
  if (quickRefreshBtn) {
    quickRefreshBtn.addEventListener('click', () => {
      triggerHardRefresh();
    });
  }
}

// ==================== VIEW ROUTING ====================
function initViewRouting() {
  const tabs = document.querySelectorAll('.nav-tab');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetView = tab.getAttribute('data-view');
      if (!targetView || targetView === currentView) return;
      
      // Update Tab CSS
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update Views Display
      const views = document.querySelectorAll('.app-view');
      views.forEach(view => view.classList.remove('active'));
      
      const targetViewEl = document.getElementById(`view-${targetView}`);
      if (targetViewEl) {
        targetViewEl.classList.add('active');
        currentView = targetView;
        
        // Render target view data
        renderActiveView();
      }
    });
  });
}

function renderActiveView() {
  const fabAddStudent = document.getElementById('fab-add-student');
  const fabLogPayment = document.getElementById('fab-log-payment');
  
  if (fabAddStudent) fabAddStudent.style.display = (currentView === 'students') ? 'flex' : 'none';
  if (fabLogPayment) fabLogPayment.style.display = (currentView === 'history') ? 'flex' : 'none';

  switch (currentView) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'students':
      renderStudents();
      break;
    case 'attendance':
      renderAttendance();
      break;
    case 'history':
      renderHistory();
      break;
    case 'settings':
      updateMasterGreeting();
      renderHolidaysList();
      break;
  }
}

// Get dynamic student membership status, due date, and overdue count (Date-to-Date Model)
function getStudentMembershipStatus(student) {
  if (student.status !== 'active') {
    return { status: 'paused', text: 'Class Paused', dueDate: null, daysLeft: 0, daysOverdue: 0 };
  }
  
  const payments = state.payments.filter(p => p.studentId === student.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (payments.length === 0) {
    // Student has never paid. Dues start on their admissionDate (or today as fallback)
    const admStr = student.admissionDate || today.toISOString().split('T')[0];
    const admDate = new Date(admStr);
    admDate.setHours(0, 0, 0, 0);
    
    const diffTime = today - admDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      status: 'unpaid',
      text: 'Never Paid',
      dueDate: admStr,
      daysOverdue: Math.max(0, diffDays),
      daysLeft: 0
    };
  }
  
  // Find the maximum validity end date across all payments
  let latestEndDate = null;
  payments.forEach(p => {
    let endStr = p.endDate;
    if (!endStr && p.monthPaidFor) {
      // Legacy data fallback: Last day of monthPaidFor YYYY-MM
      const [year, month] = p.monthPaidFor.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      endStr = `${p.monthPaidFor}-${String(lastDay).padStart(2, '0')}`;
    }
    
    if (endStr) {
      const d = new Date(endStr);
      if (!latestEndDate || d > latestEndDate) {
        latestEndDate = d;
      }
    }
  });
  
  if (latestEndDate) {
    latestEndDate.setHours(0, 0, 0, 0);
    const latestEndDateStr = latestEndDate.toISOString().split('T')[0];
    
    if (latestEndDate < today) {
      // Expired!
      const diffTime = today - latestEndDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return {
        status: 'expired',
        text: 'Expired',
        dueDate: latestEndDateStr,
        daysOverdue: diffDays,
        daysLeft: 0
      };
    } else {
      // Active Paid Membership!
      const diffTime = latestEndDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return {
        status: 'paid',
        text: 'Paid / Active',
        dueDate: latestEndDateStr,
        daysOverdue: 0,
        daysLeft: diffDays
      };
    }
  }
  
  const defaultDue = student.admissionDate || today.toISOString().split('T')[0];
  return {
    status: 'unpaid',
    text: 'Never Paid',
    dueDate: defaultDue,
    daysOverdue: 0,
    daysLeft: 0
  };
}

// Calculate Membership Validity End Date given Start Date and Plan Package
function calculateEndDateFromStartDate(startDateStr, packageVal) {
  if (!startDateStr) return '';
  const d = new Date(startDateStr);
  if (isNaN(d.getTime())) return '';
  
  let numMonths = 1;
  if (packageVal === '3m') numMonths = 3;
  else if (packageVal === '6m') numMonths = 6;
  else if (packageVal === '12m') numMonths = 12;
  else if (packageVal === 'custom') return ''; // Custom handles manually
  
  // Set month
  d.setMonth(d.getMonth() + numMonths);
  // Subtract 1 day for clean boundaries (e.g. May 15 to June 14)
  d.setDate(d.getDate() - 1);
  
  return d.toISOString().split('T')[0];
}

// Quick Payment trigger from Dashboard Outstanding cards
window.triggerQuickPayDue = function(studentId) {
  triggerQuickPay(studentId);
};

// Log dues from details profile drawer
window.payDueMonth = function(studentId) {
  closeModal('student-detail-modal');
  triggerQuickPay(studentId);
};

// ==================== VIEW 1: DASHBOARD LOGIC ====================
function renderDashboard() {
  // Get active students
  const activeStudents = state.students.filter(s => s.status === 'active');
  document.getElementById('stat-total-students').textContent = activeStudents.length;
  
  const today = new Date();
  const currentMonthStr = today.toISOString().slice(0, 7); // YYYY-MM
  
  // FIX 2: Use actual datePaid value for collection total (not the entry date)
  const currentPayments = state.payments.filter(p => p.datePaid && p.datePaid.slice(0, 7) === currentMonthStr);
  const totalCollected = currentPayments.reduce((sum, p) => sum + parseInt(p.amount || 0), 0);
  document.getElementById('stat-collected').textContent = `₹${totalCollected.toLocaleString('en-IN')}`;
  
  // FIX 1: All expired/unpaid students show in current month list.
  // Previous months list shows the same students but highlights how long they've been overdue.
  const unpaidThisMonth = [];
  const unpaidPreviousMonths = [];
  
  activeStudents.forEach(student => {
    const memStatus = getStudentMembershipStatus(student);
    if (memStatus.status === 'expired' || memStatus.status === 'unpaid') {
      // Always add to current month pending — they still owe fees NOW
      unpaidThisMonth.push({ student, memStatus });
      // Also add to previous months list if expired before this month (to show overdue history)
      if (memStatus.dueDate < currentMonthStr + '-01') {
        unpaidPreviousMonths.push({ student, memStatus });
      }
    }
  });
  
  // Calculate Pending Fees (Current Month Standard Batch Price)
  const totalPending = unpaidThisMonth.reduce((sum, s) => sum + parseInt(s.student.monthlyFee || 0), 0);
  document.getElementById('stat-pending').textContent = `₹${totalPending.toLocaleString('en-IN')}`;
  
  // Calculate collection progress bar
  const totalTarget = totalCollected + totalPending;
  const collectionRate = totalTarget > 0 ? Math.round((totalCollected / totalTarget) * 100) : 100;
  
  document.getElementById('progress-percent').textContent = `${collectionRate}%`;
  document.getElementById('progress-bar-fill').style.width = `${collectionRate}%`;

  // Render Consecutive Absence Alerts on Dashboard
  const absenceSection = document.getElementById('dashboard-absence-section');
  const absenceList = document.getElementById('dashboard-absence-list');
  const absenceCountBadge = document.getElementById('dashboard-absence-count-badge');

  const absentStudentsWithAlerts = [];
  activeStudents.forEach(student => {
    const consCount = getConsecutiveAbsences(student.id);
    if (consCount >= 2) {
      absentStudentsWithAlerts.push({ student, count: consCount });
    }
  });

  if (absenceSection && absenceList) {
    if (absentStudentsWithAlerts.length === 0) {
      absenceSection.style.display = 'none';
      absenceList.innerHTML = '';
    } else {
      absenceSection.style.display = 'block';
      if (absenceCountBadge) absenceCountBadge.textContent = absentStudentsWithAlerts.length;
      absenceList.innerHTML = '';

      absentStudentsWithAlerts.forEach(({ student, count }) => {
        let cleanPhone = (student.phone || '').replace(/[^0-9]/g, '');
        if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

        const msg = `Hi Sir/Madam, this is a friendly message from Niki Dance Studio (NDS). We noticed that *${student.name}* has not attended classes for *${count} consecutive days*. We miss them in class! Please send them or let us know if everything is okay. Thank you! 🙏`;
        const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;

        const initials = student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const avatarContent = student.photo
          ? `<img src="${student.photo}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; flex-shrink:0;">`
          : `<div style="width:40px; height:40px; border-radius:50%; background:rgba(227,28,37,0.15); border:1.5px solid var(--brand-red); display:flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:700; color:var(--brand-red); flex-shrink:0;">${initials}</div>`;

        const card = document.createElement('div');
        card.className = 'pending-card glass-card animated-fade-in due-card-warning';
        card.style.borderLeftColor = 'var(--brand-red)';
        card.innerHTML = `
          <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
            ${avatarContent}
            <div style="display:flex; flex-direction:column; gap:2px; min-width:0;">
              <span style="font-weight:700; color:var(--brand-white); font-size:0.92rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${student.name}</span>
              <span style="font-size:0.75rem; color:var(--brand-red); font-weight:600;">⚠️ Absent for ${count} consecutive classes</span>
              <span style="font-size:0.7rem; color:var(--text-secondary);">${student.batch || 'General Batch'} • Ph: ${student.phone}</span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <a href="${waUrl}" target="_blank" class="btn btn-primary btn-sm btn-glow" style="background:#25D366; border-color:#25D366; color:#fff; display:inline-flex; align-items:center; gap:6px; padding:7px 14px; font-size:0.78rem; font-weight:700; text-decoration:none;" title="Send WhatsApp alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
              Notify Parent
            </a>
          </div>
        `;
        absenceList.appendChild(card);
      });
    }
  }

  // Render Pending List Block
  const pendingListContainer = document.getElementById('pending-students-list');
  pendingListContainer.innerHTML = '';
  
  const pendingCountBadge = document.getElementById('pending-count-badge');
  const sectionTitle = document.getElementById('pending-section-title');
  
  if (pendingFilterMode === 'current') {
    sectionTitle.textContent = 'FEES PENDING THIS MONTH';
    pendingCountBadge.textContent = unpaidThisMonth.length;
    if (unpaidThisMonth.length > 0) {
      pendingCountBadge.className = 'badge badge-red';
    } else {
      pendingCountBadge.className = 'badge badge-outline';
    }
    
    if (unpaidThisMonth.length === 0) {
      pendingListContainer.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <p>Hooray! No pending fees for this month.</p>
        </div>
      `;
      return;
    }
    
    unpaidThisMonth.forEach(item => {
      const student = item.student;
      const memStatus = item.memStatus;
      
      const card = document.createElement('div');
      card.className = 'pending-card glass-card animated-fade-in';
      
      // Formatting due date
      const dueFormatted = new Date(memStatus.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const statusText = memStatus.status === 'unpaid' ? `Never paid (Admitted: ${dueFormatted})` : `Expired on: ${dueFormatted}`;
      
      // FIX 3: Build full package price list for the student's batch
      const batch = student.batch || 'Kids batch (batch 1)';
      const pricing = state.batchPricing[batch] || { '1m': 1500, '3m': 4000, '6m': 7500, '12m': 14000 };
      const packageList = `1 Month: ₹${pricing['1m']} | 3 Months: ₹${pricing['3m']} | 6 Months: ₹${pricing['6m']} | 12 Months: ₹${pricing['12m']}`;
      const whatsappMsgText = `Hi Sir/Madam, this is a friendly reminder from Niki Dance Studio (NDS) regarding ${student.name}'s fees. Validity ended on: ${dueFormatted}.\n\nFee Packages (${batch}):\n${packageList}\n\nKindly clear the pending fees. Thank you!`;
      const whatsappUrl = `https://api.whatsapp.com/send?phone=91${student.phone.trim()}&text=${encodeURIComponent(whatsappMsgText)}`;
      
      card.innerHTML = `
        <div class="pending-info">
          <span class="pending-student-name">${student.name}</span>
          <span class="pending-details">
            ${student.batch || 'General Batch'} • <span class="pending-amount">₹${parseInt(student.monthlyFee || 0).toLocaleString('en-IN')}</span>
          </span>
          <span class="pending-details" style="font-size: 0.72rem; color: var(--brand-red); margin-top: 2px;">
            ${statusText}
          </span>
        </div>
        <div class="pending-actions">
          <a href="tel:${student.phone}" class="action-btn-circle call" title="Call Student">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          </a>
          <a href="${whatsappUrl}" target="_blank" class="action-btn-circle whatsapp" title="Send WhatsApp Reminder">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          </a>
          <button class="action-btn-circle pay" onclick="triggerQuickPay('${student.id}')" title="Log Payment">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="12" y1="10" x2="12" y2="10"></line><line x1="2" y1="10" x2="22" y2="10"></line></svg>
          </button>
        </div>
      `;
      pendingListContainer.appendChild(card);
    });
  } else {
    sectionTitle.textContent = 'PREVIOUS MONTHS UNPAID DUES';
    pendingCountBadge.textContent = unpaidPreviousMonths.length;
    if (unpaidPreviousMonths.length > 0) {
      pendingCountBadge.className = 'badge badge-warning';
    } else {
      pendingCountBadge.className = 'badge badge-outline';
    }
    
    if (unpaidPreviousMonths.length === 0) {
      pendingListContainer.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          <p>Superb! No unpaid dues from previous months.</p>
        </div>
      `;
      return;
    }
    
    unpaidPreviousMonths.forEach(item => {
      const student = item.student;
      const memStatus = item.memStatus;
      
      // Format due date
      const dueFormatted = new Date(memStatus.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      
      const card = document.createElement('div');
      card.className = 'pending-card glass-card animated-fade-in due-card-warning';
      
      // FIX 3: Full package price list in previous-months reminder too
      const batchPrev = student.batch || 'Kids batch (batch 1)';
      const pricingPrev = state.batchPricing[batchPrev] || { '1m': 1500, '3m': 4000, '6m': 7500, '12m': 14000 };
      const packageListPrev = `1 Month: ₹${pricingPrev['1m']} | 3 Months: ₹${pricingPrev['3m']} | 6 Months: ₹${pricingPrev['6m']} | 12 Months: ₹${pricingPrev['12m']}`;
      const whatsappMsgText = `Hi Sir/Madam, this is a reminder from Niki Dance Studio (NDS) regarding ${student.name}'s fees. Overdue since: ${dueFormatted} (${memStatus.daysOverdue} days).\n\nFee Packages (${batchPrev}):\n${packageListPrev}\n\nKindly clear the pending dues. Thank you!`;
      const whatsappUrl = `https://api.whatsapp.com/send?phone=91${student.phone.trim()}&text=${encodeURIComponent(whatsappMsgText)}`;
      
      card.innerHTML = `
        <div class="pending-info">
          <span class="pending-student-name">${student.name}</span>
          <span class="pending-details" style="margin-bottom: 2px;">
            <span class="badge badge-warning" style="font-size:0.6rem; padding:2px 6px; display:inline-block;">Overdue: ${memStatus.daysOverdue} days</span>
          </span>
          <span class="pending-details">
            ${student.batch || 'General Batch'} • <span class="pending-amount">₹${parseInt(student.monthlyFee || 0).toLocaleString('en-IN')}</span>
          </span>
          <span class="pending-details" style="font-size: 0.72rem; color: var(--warning-gold); margin-top: 2.5px;">
            Due Date: ${dueFormatted}
          </span>
        </div>
        <div class="pending-actions">
          <a href="tel:${student.phone}" class="action-btn-circle call" title="Call Student">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          </a>
          <a href="${whatsappUrl}" target="_blank" class="action-btn-circle whatsapp" title="Send WhatsApp Reminder">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          </a>
          <button class="action-btn-circle pay" onclick="triggerQuickPay('${student.id}')" title="Log Payment">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="12" y1="10" x2="12" y2="10"></line><line x1="2" y1="10" x2="22" y2="10"></line></svg>
          </button>
        </div>
      `;
      pendingListContainer.appendChild(card);
    });
  }
}

// Quick Payment trigger from Dashboard Outstanding cards
window.triggerQuickPay = function(studentId) {
  const student = state.students.find(s => s.id === studentId);
  if (!student) return;
  
  // Populate dropdown options first
  populateStudentDropdown();
  
  // Hide select options dropdown and show locked name card for quick payments
  document.getElementById('payment-student-select-container').style.display = 'none';
  document.getElementById('payment-student-locked-container').style.display = 'flex';
  document.getElementById('payment-student-label').textContent = 'Recording Receipt For';
  document.getElementById('payment-student-locked-name').textContent = student.name + (student.batch ? ` (${student.batch})` : '');
  
  openModal('payment-modal');
  
  // Set student select field
  const studentSelect = document.getElementById('payment-student-id');
  if (studentSelect) {
    studentSelect.value = student.id;
  }
  
  // Fetch membership details to calculate default dates
  const memStatus = getStudentMembershipStatus(student);
  const startDateInput = document.getElementById('payment-start-date');
  const endDateInput = document.getElementById('payment-end-date');
  const packageSelect = document.getElementById('payment-package');
  const amountField = document.getElementById('payment-amount');
  
  // Default start date: if expired/paid before, day after the latest expiration date. If never paid, admissionDate or today.
  let defaultStartStr = student.admissionDate || new Date().toISOString().split('T')[0];
  if (memStatus.status === 'expired' || memStatus.status === 'paid') {
    // Add 1 day to the previous due date to start the next period
    const lastEnd = new Date(memStatus.dueDate);
    lastEnd.setDate(lastEnd.getDate() + 1);
    defaultStartStr = lastEnd.toISOString().split('T')[0];
  }
  
  if (startDateInput) {
    startDateInput.value = defaultStartStr;
  }
  
  // Default package: 1 Month
  if (packageSelect) {
    packageSelect.value = '1m';
  }
  
  // Trigger update to calculate default price & end date based on batch configuration
  updateCalculatedPaymentFields();
};

// Populate dynamic select list of active students for log payment modal (Global function)
function populateStudentDropdown() {
  const studentSelect = document.getElementById('payment-student-id');
  if (!studentSelect) return;
  
  // Sort active students alphabetically
  const activeStudentsSorted = state.students
    .filter(s => s.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name));
    
  studentSelect.innerHTML = '<option value="">-- Choose Student --</option>';
  activeStudentsSorted.forEach(student => {
    const opt = document.createElement('option');
    opt.value = student.id;
    opt.textContent = `${student.name} (${student.batch || 'General'})`;
    studentSelect.appendChild(opt);
  });
  
  // Wire change listener using standard onchange to overwrite duplicates
  studentSelect.onchange = () => {
    const sId = studentSelect.value;
    if (sId) {
      const student = state.students.find(s => s.id === sId);
      if (student) {
        // Fetch membership details to calculate default start date
        const memStatus = getStudentMembershipStatus(student);
        const startDateInput = document.getElementById('payment-start-date');
        const packageSelect = document.getElementById('payment-package');
        
        let defaultStartStr = student.admissionDate || new Date().toISOString().split('T')[0];
        if (memStatus.status === 'expired' || memStatus.status === 'paid') {
          const lastEnd = new Date(memStatus.dueDate);
          lastEnd.setDate(lastEnd.getDate() + 1);
          defaultStartStr = lastEnd.toISOString().split('T')[0];
        }
        
        if (startDateInput) {
          startDateInput.value = defaultStartStr;
        }
        
        if (packageSelect) {
          packageSelect.value = '1m';
        }
        
        updateCalculatedPaymentFields();
      }
    }
  };
}

// ==================== VIEW 2: STUDENTS LOGIC ====================
function renderStudents() {
  const gridContainer = document.getElementById('students-grid');
  const searchInput = document.getElementById('student-search-input');
  const batchFilter = document.getElementById('student-batch-filter');
  const statusFilter = document.getElementById('student-status-filter');
  
  if (!gridContainer) return;
  
  const query = searchInput.value.toLowerCase().trim();
  const selectedBatch = batchFilter.value;
  const selectedStatus = statusFilter.value;
  
  // Filter active/inactive
  let filtered = state.students;
  if (selectedStatus !== 'all') {
    filtered = filtered.filter(s => s.status === selectedStatus);
  }
  
  // Filter batch
  if (selectedBatch !== 'all') {
    filtered = filtered.filter(s => s.batch === selectedBatch);
  }
  
  // Filter search query
  if (query) {
    filtered = filtered.filter(s => {
      return s.name.toLowerCase().includes(query) || 
             s.phone.includes(query) || 
             (s.parentName && s.parentName.toLowerCase().includes(query));
    });
  }
  
  // Sync Batch Filter Dropdown options with unique existing batches
  syncBatchFilters();
  
  gridContainer.innerHTML = '';
  
  if (filtered.length === 0) {
    gridContainer.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
        <p>No students found matching filters.</p>
      </div>
    `;
    return;
  }
  
  const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
  
  filtered.forEach(student => {
    const card = document.createElement('div');
    card.className = 'student-card glass-card animated-fade-in';
    card.addEventListener('click', () => showStudentDetails(student.id));
    
    // Check if paid this month
    const paidThisMonth = state.payments.some(p => p.studentId === student.id && p.monthPaidFor === currentMonthStr);
    const statusDotClass = paidThisMonth ? 'paid' : 'pending';
    
    const initials = student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const isStudentActive = student.status === 'active';
    const avatarContent = student.photo
      ? `<img src="${student.photo}" alt="${student.name}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
      : `<span class="student-avatar-letter">${initials}</span>`;
    
    card.innerHTML = `
      <div class="student-card-left">
        <div class="student-avatar ${isStudentActive ? 'active-student' : ''}">
          ${avatarContent}
          ${isStudentActive ? `<div class="status-dot ${statusDotClass}"></div>` : ''}
        </div>
        <div class="student-card-details">
          <div class="student-name-row">
            <span class="student-name">${student.name}</span>
            ${!isStudentActive ? `<span class="badge badge-outline" style="font-size:0.55rem; padding: 1px 4px;">Paused</span>` : ''}
          </div>
          <span class="student-batch">${student.batch || 'General Batch'}</span>
          <span class="student-subdetails">Ph: ${student.phone}</span>
        </div>
      </div>
      <div class="student-card-right">
        <span class="student-fee-val">₹${parseInt(student.monthlyFee || 0).toLocaleString('en-IN')}</span>
        <span class="student-subdetails" style="font-size:0.6rem;">Monthly Fee</span>
      </div>
    `;
    gridContainer.appendChild(card);
  });
}

function syncBatchFilters() {
  const batchFilter = document.getElementById('student-batch-filter');
  if (!batchFilter) return;
  
  const currentVal = batchFilter.value;
  
  // Extract unique batches
  const batches = [...new Set(state.students.map(s => s.batch).filter(Boolean))];
  
  batchFilter.innerHTML = '<option value="all">All Batches</option>';
  batches.forEach(batch => {
    const opt = document.createElement('option');
    opt.value = batch;
    opt.textContent = batch;
    batchFilter.appendChild(opt);
  });
  
  // Restore value if existed
  batchFilter.value = currentVal;
}

// Student detail drawer panel popup
function showStudentDetails(studentId) {
  const student = state.students.find(s => s.id === studentId);
  if (!student) return;
  
  selectedStudentId = student.id;
  openModal('student-detail-modal');
  
  // Init details
  const initials = student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const profileAvatar = document.querySelector('.profile-avatar');
  if (profileAvatar) {
    if (student.photo) {
      profileAvatar.innerHTML = `<img src="${student.photo}" alt="${student.name}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
      profileAvatar.innerHTML = `<span id="detail-avatar-letter">${initials}</span>`;
    }
  }
  document.getElementById('detail-student-name').textContent = student.name;
  document.getElementById('detail-student-batch').textContent = student.batch || 'General Batch';
  document.getElementById('detail-student-phone').textContent = student.phone;
  document.getElementById('detail-student-parent').textContent = student.parentName || 'Not Listed';
  
  const admDate = student.admissionDate ? new Date(student.admissionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not Listed';
  document.getElementById('detail-student-admission').textContent = admDate;
  
  // Chip styling & Membership Status
  const statusBadge = document.getElementById('detail-status-badge');
  const memStatus = getStudentMembershipStatus(student);
  
  if (student.status !== 'active') {
    statusBadge.textContent = 'Paused Class';
    statusBadge.className = 'badge badge-warning';
  } else if (memStatus.status === 'paid') {
    statusBadge.textContent = `Paid (Expires: ${new Date(memStatus.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`;
    statusBadge.className = 'badge badge-success';
  } else if (memStatus.status === 'expired') {
    statusBadge.textContent = `Overdue (${memStatus.daysOverdue} days)`;
    statusBadge.className = 'badge badge-danger';
  } else {
    statusBadge.textContent = 'Never Paid';
    statusBadge.className = 'badge badge-danger';
  }
  
  document.getElementById('detail-monthly-fee-badge').textContent = `₹${parseInt(student.monthlyFee || 0).toLocaleString('en-IN')} / month`;
  
  // Load Pending Dues for this specific student
  const duesWrapper = document.getElementById('detail-dues-wrapper');
  const duesList = document.getElementById('detail-dues-list');
  
  if (duesWrapper && duesList) {
    if (student.status !== 'active' || memStatus.status === 'paid') {
      duesWrapper.style.display = 'none';
    } else {
      duesWrapper.style.display = 'block';
      duesList.innerHTML = '';
      
      const dueFormatted = new Date(memStatus.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const dueText = memStatus.status === 'unpaid' ? `Never paid (Admitted: ${dueFormatted})` : `Expired on ${dueFormatted} (${memStatus.daysOverdue} days overdue)`;
      
      const row = document.createElement('div');
      row.className = 'detail-due-row';
      row.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span style="font-weight:700; color:var(--brand-white); font-size:0.78rem;">Pending Fee Payment</span>
          <span style="font-size:0.7rem; color:var(--text-secondary);">${dueText}</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="payDueMonth('${student.id}')" style="padding: 6px 12px; font-size: 0.72rem; border-color: rgba(245, 158, 11, 0.3);">Collect</button>
      `;
      duesList.appendChild(row);
    }
  }
  
  // Load Payments History for this specific student
  const studentPayments = state.payments
    .filter(p => p.studentId === student.id)
    .sort((a, b) => new Date(b.datePaid) - new Date(a.datePaid));
    
  const historyList = document.getElementById('detail-payment-history');
  historyList.innerHTML = '';
  
  if (studentPayments.length === 0) {
    historyList.innerHTML = `<div class="detail-payment-row empty-row">No recorded fee receipt.</div>`;
  } else {
    studentPayments.forEach(p => {
      // Validity duration display fallback
      let validityText = '';
      if (p.startDate && p.endDate) {
        const startStr = new Date(p.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
        const endStr = new Date(p.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
        validityText = `Validity: ${startStr} to ${endStr}`;
      } else if (p.monthPaidFor) {
        // Fallback for legacy database entries
        const monthYear = new Date(p.monthPaidFor + '-02').toLocaleDateString('default', { month: 'short', year: 'numeric' });
        validityText = `${monthYear} Month Fees`;
      }
      
      const payDate = new Date(p.datePaid).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      
      const row = document.createElement('div');
      row.className = 'detail-payment-row';
      row.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span style="font-weight:600;">${validityText}</span>
          <span style="font-size:0.7rem; color:var(--text-muted);">Receipt Date: ${payDate}</span>
        </div>
        <span><strong>₹${parseInt(p.amount || 0).toLocaleString('en-IN')}</strong> (${p.method || 'Cash'})</span>
      `;
      historyList.appendChild(row);
    });
  }

  // Load Attendance Record for this specific student
  const studentAtt = (state.attendance || [])
    .filter(a => a.studentId === student.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const attPresent = studentAtt.filter(a => a.status === 'present').length;
  const attAbsent = studentAtt.filter(a => a.status === 'absent').length;
  const attTotal = studentAtt.length;
  const attRate = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 0;

  const presentEl = document.getElementById('detail-att-present');
  const absentEl = document.getElementById('detail-att-absent');
  const totalEl = document.getElementById('detail-att-total');
  const rateEl = document.getElementById('detail-attendance-rate');
  const logsEl = document.getElementById('detail-attendance-logs');

  if (presentEl) presentEl.textContent = attPresent;
  if (absentEl) absentEl.textContent = attAbsent;
  if (totalEl) totalEl.textContent = attTotal;

  if (rateEl) {
    if (attTotal === 0) {
      rateEl.textContent = 'No Class Data';
      rateEl.className = 'badge badge-outline';
    } else {
      rateEl.textContent = `${attRate}% Attendance`;
      rateEl.className = attRate >= 80 ? 'badge badge-success' : (attRate >= 50 ? 'badge badge-warning' : 'badge badge-danger');
    }
  }

  if (logsEl) {
    logsEl.innerHTML = '';
    if (studentAtt.length === 0) {
      logsEl.innerHTML = '<div style="color:var(--text-secondary); font-size:0.75rem;">No attendance logged for this student yet.</div>';
    } else {
      studentAtt.slice(0, 15).forEach(a => {
        const dateStr = new Date(a.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const isPres = a.status === 'present';
        const item = document.createElement('div');
        item.className = 'att-log-item';
        item.innerHTML = `
          <span>📅 ${dateStr}</span>
          <span class="badge ${isPres ? 'badge-success' : 'badge-danger'}" style="font-size:0.68rem; padding: 2px 8px;">${isPres ? '✓ Present' : '✕ Absent'}</span>
        `;
        logsEl.appendChild(item);
      });
    }
  }
}

// ==================== VIEW 3: PAYMENTS HISTORY LOGS ====================
function renderHistory() {
  const listContainer = document.getElementById('payment-history-list');
  const searchInput = document.getElementById('history-search-input');
  const monthFilter = document.getElementById('history-month-filter');
  const clearMonthBtn = document.getElementById('clear-month-filter');
  
  if (!listContainer) return;
  
  const query = searchInput.value.toLowerCase().trim();
  const selectedMonth = monthFilter.value; // YYYY-MM
  
  if (selectedMonth) {
    clearMonthBtn.style.display = 'block';
  } else {
    clearMonthBtn.style.display = 'none';
  }
  
  let filtered = state.payments;
  
  // Filter by payment date month (datePaid starts with YYYY-MM)
  if (selectedMonth) {
    filtered = filtered.filter(p => p.datePaid && p.datePaid.slice(0, 7) === selectedMonth);
  }
  
  // Sort payments by date descending (newest first)
  filtered.sort((a, b) => new Date(b.datePaid) - new Date(a.datePaid));
  
  // Filter by search query (matches student name)
  if (query) {
    filtered = filtered.filter(p => {
      const student = state.students.find(s => s.id === p.studentId);
      return student && student.name.toLowerCase().includes(query);
    });
  }
  
  listContainer.innerHTML = '';
  
  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="12" y1="10" x2="12" y2="10"></line></svg>
        <p>No payment logs found.</p>
      </div>
    `;
    return;
  }
  
  filtered.forEach(p => {
    const student = state.students.find(s => s.id === p.studentId);
    const studentName = student ? student.name : 'Unknown Student';
    
    // Formatting Dates
    const paidDateFormatted = new Date(p.datePaid).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    
    // Calculate validity description
    let validityText = '';
    if (p.startDate && p.endDate) {
      const startStr = new Date(p.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const endStr = new Date(p.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      validityText = `Validity: ${startStr} to ${endStr}`;
    } else if (p.monthPaidFor) {
      const monthYear = new Date(p.monthPaidFor + '-02').toLocaleDateString('default', { month: 'short', year: 'numeric' });
      validityText = `Month: ${monthYear}`;
    }
    
    // Translate package to badge label
    let packageLabel = '1 Month';
    if (p.package === '3m') packageLabel = '3 Months';
    else if (p.package === '6m') packageLabel = '6 Months';
    else if (p.package === '12m') packageLabel = '1 Year';
    else if (p.package === 'custom') packageLabel = 'Custom';
    
    const card = document.createElement('div');
    card.className = 'history-card glass-card animated-fade-in';
    
    card.innerHTML = `
      <div class="history-left">
        <span class="history-student-name">${studentName}</span>
        <span class="history-meta" style="margin-bottom: 2px;">
          ${validityText}
        </span>
        <span class="history-meta">
          Paid on ${paidDateFormatted} • <span class="history-mode">${p.method || 'Cash'}</span>
        </span>
        ${p.remarks ? `<span class="history-mode" style="font-size:0.7rem; font-style:italic;">Note: ${p.remarks}</span>` : ''}
      </div>
      <div class="history-right">
        <span class="history-amount">+ ₹${parseInt(p.amount || 0).toLocaleString('en-IN')}</span>
        <span class="badge badge-success history-month-tag">${packageLabel}</span>
      </div>
    `;
    listContainer.appendChild(card);
  });
}

// Profile Photo upload handlers
function setPhotoPreview(photoBase64) {
  const previewImg = document.getElementById('photo-preview-img');
  const placeholderIcon = document.getElementById('photo-placeholder-icon');
  const hiddenInput = document.getElementById('student-photo-base64');
  const fileInput = document.getElementById('student-photo-input');

  if (fileInput) fileInput.value = '';
  if (hiddenInput) hiddenInput.value = photoBase64 || '';

  if (photoBase64 && previewImg) {
    previewImg.src = photoBase64;
    previewImg.style.display = 'block';
    if (placeholderIcon) placeholderIcon.style.display = 'none';
  } else {
    if (previewImg) {
      previewImg.src = '';
      previewImg.style.display = 'none';
    }
    if (placeholderIcon) placeholderIcon.style.display = 'block';
  }
}

function handlePhotoInputChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = function() {
    try {
      const canvas = document.createElement('canvas');
      const size = 180;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;

      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
      const base64Photo = canvas.toDataURL('image/jpeg', 0.85);
      setPhotoPreview(base64Photo);
    } catch (err) {
      console.error('Error processing photo:', err);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };
  img.onerror = function() {
    URL.revokeObjectURL(objectUrl);
    showToast('Failed to load image file', 'danger');
  };
  img.src = objectUrl;
}

// ==================== FORMS AND MODALS MANAGEMENT ====================
function initFormsAndModals() {
  const photoInput = document.getElementById('student-photo-input');
  if (photoInput) {
    photoInput.addEventListener('change', handlePhotoInputChange);
  }

  // Sync inputs
  const searchInput = document.getElementById('student-search-input');
  if (searchInput) searchInput.addEventListener('input', renderStudents);
  
  const batchFilter = document.getElementById('student-batch-filter');
  if (batchFilter) batchFilter.addEventListener('change', renderStudents);
  
  const statusFilter = document.getElementById('student-status-filter');
  if (statusFilter) statusFilter.addEventListener('change', renderStudents);
  
  const histSearchInput = document.getElementById('history-search-input');
  if (histSearchInput) histSearchInput.addEventListener('input', renderHistory);
  
  const histMonthFilter = document.getElementById('history-month-filter');
  if (histMonthFilter) histMonthFilter.addEventListener('change', renderHistory);
  
  const clearMonthBtn = document.getElementById('clear-month-filter');
  if (clearMonthBtn) {
    clearMonthBtn.addEventListener('click', () => {
      histMonthFilter.value = '';
      renderHistory();
    });
  }

  // Onboarding setup form
  const onboardingForm = document.getElementById('onboarding-form');
  if (onboardingForm) {
    onboardingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('onboarding-name');
      if (nameInput) {
        state.masterName = nameInput.value.trim();
        saveState();
        updateMasterGreeting();
        
        // Hide overlay
        document.getElementById('onboarding-modal').style.display = 'none';
        showToast(`Welcome Master ${state.masterName}!`, 'success');
        
        // Render Dashboard
        renderActiveView();
      }
    });
  }
  
  // Settings Profile Form
  const profileForm = document.getElementById('settings-profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const masterNameInput = document.getElementById('settings-master-name');
      if (masterNameInput) {
        state.masterName = masterNameInput.value.trim();
        saveState();
        updateMasterGreeting();
        showToast('Studio profile master name updated!', 'success');
      }
    });
  }

  // Floating Action Button FAB bindings
  const fabAddStudent = document.getElementById('fab-add-student');
  if (fabAddStudent) {
    fabAddStudent.addEventListener('click', () => {
      // Clear edit values
      document.getElementById('student-id-field').value = '';
      document.getElementById('student-form').reset();
      setPhotoPreview('');
      
      // Clear legacy options from edit mode
      const batchSelect = document.getElementById('student-batch');
      Array.from(batchSelect.options).forEach(opt => {
        if (opt.dataset.custom === 'true') opt.remove();
      });
      batchSelect.value = '';
      
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('student-admission').value = today;
      document.getElementById('student-fee').value = '1500';
      
      document.getElementById('student-modal-title').textContent = 'ADMIT NEW STUDENT';
      document.getElementById('status-group').style.display = 'none'; // Hide status (new defaults to active)
      
      openModal('student-modal');
    });
  }
  
  const fabLogPayment = document.getElementById('fab-log-payment');
  if (fabLogPayment) {
    fabLogPayment.addEventListener('click', () => {
      // Clear forms
      document.getElementById('payment-id-field').value = '';
      document.getElementById('payment-form').reset();
      
      // Reset student select visibility for full logs
      document.getElementById('payment-student-select-container').style.display = 'block';
      document.getElementById('payment-student-locked-container').style.display = 'none';
      document.getElementById('payment-student-label').textContent = 'Select Student *';
      
      // Seed date and package
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('payment-date').value = today;
      document.getElementById('payment-start-date').value = today;
      document.getElementById('payment-package').value = '1m';
      
      document.getElementById('payment-modal-title').textContent = 'RECORD FEE PAYMENT';
      
      // Populate student options list
      populateStudentDropdown();
      
      // Trigger default calculation updates
      updateCalculatedPaymentFields();
      
      openModal('payment-modal');
    });
  }

  // populateStudentDropdown is now defined globally to enable quick pay actions to work smoothly

  // Student Admissions Form Submit handler (Admissions & edits)
  const studentForm = document.getElementById('student-form');
  if (studentForm) {
    studentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const studentId = document.getElementById('student-id-field').value;
      const name = document.getElementById('student-name').value.trim();
      const phone = document.getElementById('student-phone').value.trim();
      const parentName = document.getElementById('student-parent').value.trim();
      const batch = document.getElementById('student-batch').value.trim();
      const monthlyFee = parseInt(document.getElementById('student-fee').value || 0);
      const admissionDate = document.getElementById('student-admission').value;
      const photo = document.getElementById('student-photo-base64').value || '';
      
      if (!studentId) {
        // Create new student
        const newStudent = {
          id: 'std_' + Date.now(),
          name,
          phone,
          parentName,
          batch,
          monthlyFee,
          admissionDate,
          photo,
          status: 'active'
        };
        state.students.push(newStudent);
        showToast(`${name} admitted successfully!`, 'success');
      } else {
        // Edit existing student
        const index = state.students.findIndex(s => s.id === studentId);
        if (index !== -1) {
          const status = document.getElementById('student-status').value;
          state.students[index] = {
            ...state.students[index],
            name,
            phone,
            parentName,
            batch,
            monthlyFee,
            admissionDate,
            photo,
            status
          };
          showToast(`${name} profile updated!`, 'success');
        }
      }
      
      saveState();
      closeModal('student-modal');
      renderActiveView();
    });
  }
  
  // Payment Form Submit Handler
  const paymentForm = document.getElementById('payment-form');
  if (paymentForm) {
    paymentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const paymentId = document.getElementById('payment-id-field').value;
      const studentId = document.getElementById('payment-student-id').value;
      const amount = parseInt(document.getElementById('payment-amount').value || 0);
      const packageVal = document.getElementById('payment-package').value;
      const startDate = document.getElementById('payment-start-date').value;
      const endDate = document.getElementById('payment-end-date').value;
      const datePaid = document.getElementById('payment-date').value;
      const method = document.getElementById('payment-method').value;
      const remarks = document.getElementById('payment-remarks').value.trim();
      
      const student = state.students.find(s => s.id === studentId);
      const studentName = student ? student.name : 'Student';
      
      if (!paymentId) {
        // Log new payment
        const newPayment = {
          id: 'pay_' + Date.now(),
          studentId,
          amount,
          package: packageVal,
          startDate,
          endDate,
          datePaid,
          method,
          remarks
        };
        state.payments.push(newPayment);
        
        showToast(`Fees receipt logged for ${studentName}!`, 'success');
      }
      
      saveState();
      closeModal('payment-modal');
      renderActiveView();
    });
  }

  // Student Profile details action triggers (Delete, Edit, Quick Pay)
  const btnDeleteStudent = document.getElementById('btn-delete-student');
  if (btnDeleteStudent) {
    btnDeleteStudent.addEventListener('click', () => {
      if (!selectedStudentId) return;
      const student = state.students.find(s => s.id === selectedStudentId);
      if (!student) return;
      
      const doubleConfirm = confirm(`WARNING: Are you sure you want to delete ${student.name}? This will permanently delete their class registration and ALL past payment history logs!`);
      if (doubleConfirm) {
        // Delete student
        state.students = state.students.filter(s => s.id !== selectedStudentId);
        // Delete associated payments
        state.payments = state.payments.filter(p => p.studentId !== selectedStudentId);
        
        saveState();
        closeModal('student-detail-modal');
        showToast(`${student.name} deleted completely!`, 'danger');
        renderActiveView();
      }
    });
  }

  const btnEditStudent = document.getElementById('btn-edit-student');
  if (btnEditStudent) {
    btnEditStudent.addEventListener('click', () => {
      if (!selectedStudentId) return;
      const student = state.students.find(s => s.id === selectedStudentId);
      if (!student) return;
      
      closeModal('student-detail-modal');
      
      // Load form details
      document.getElementById('student-id-field').value = student.id;
      document.getElementById('student-name').value = student.name;
      document.getElementById('student-phone').value = student.phone;
      document.getElementById('student-parent').value = student.parentName || '';
      
      // Populate batch select dropdown with legacy safety fallback
      const batchSelect = document.getElementById('student-batch');
      const standardBatches = [
        "Kids batch (batch 1)",
        "Intermediate (batch 2)",
        "Advanced batch (batch 3)",
        "Gymnastics batch",
        "Zumba batch"
      ];
      
      // Clear previous custom options
      Array.from(batchSelect.options).forEach(opt => {
        if (opt.dataset.custom === 'true') opt.remove();
      });
      
      // If legacy batch doesn't match new standard options, append it safely
      if (student.batch && !standardBatches.includes(student.batch)) {
        const legacyOpt = document.createElement('option');
        legacyOpt.value = student.batch;
        legacyOpt.textContent = `${student.batch} (Legacy)`;
        legacyOpt.dataset.custom = 'true';
        batchSelect.appendChild(legacyOpt);
      }
      batchSelect.value = student.batch || '';
      
      document.getElementById('student-fee').value = student.monthlyFee;
      document.getElementById('student-admission').value = student.admissionDate || '';
      
      // Show and populate status dropdown
      document.getElementById('status-group').style.display = 'block';
      document.getElementById('student-status').value = student.status || 'active';
      setPhotoPreview(student.photo || '');
      
      document.getElementById('student-modal-title').textContent = 'EDIT STUDENT PROFILE';
      openModal('student-modal');
    });
  }
  
  const btnQuickPayStudent = document.getElementById('btn-quick-pay-student');
  if (btnQuickPayStudent) {
    btnQuickPayStudent.addEventListener('click', () => {
      if (!selectedStudentId) return;
      closeModal('student-detail-modal');
      triggerQuickPay(selectedStudentId);
    });
  }
}

// Global modal actions
window.openModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('animated-fade-in');
    
    // Apply body lock to avoid background scroll drag issues on mobile browsers
    document.body.style.overflow = 'hidden';
  }
};

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
    
    // Unlock scrolling only if no other modals are open
    const openModals = Array.from(document.querySelectorAll('.modal-overlay'))
      .filter(m => m.style.display === 'flex');
      
    if (openModals.length === 0) {
      document.body.style.overflow = '';
    }
  }
};

// ==================== DATABASE BACKUP AND RESTORE ====================
function initDataAdministration() {
  const btnBackup = document.getElementById('btn-backup-data');
  if (btnBackup) {
    btnBackup.addEventListener('click', () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
      const downloadAnchor = document.createElement('a');
      
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
      const filename = `nds_database_backup_${dateStr}.json`;
      
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", filename);
      document.body.appendChild(downloadAnchor);
      
      downloadAnchor.click();
      downloadAnchor.remove();
      
      showToast('Database backup (.json) downloaded!', 'success');
    });
  }
  
  const btnTriggerRestore = document.getElementById('btn-trigger-restore');
  const restoreInput = document.getElementById('restore-file-input');
  
  if (btnTriggerRestore && restoreInput) {
    btnTriggerRestore.addEventListener('click', () => {
      restoreInput.click();
    });
    
    restoreInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const parsed = JSON.parse(evt.target.result);
          
          // Schema Validation
          if (parsed && typeof parsed === 'object') {
            const doubleCheck = confirm('Are you sure you want to restore? This will OVERWRITE your current active database completely!');
            if (doubleCheck) {
              state.masterName = parsed.masterName || '';
              state.students = parsed.students || [];
              state.payments = parsed.payments || [];
              
              saveState();
              updateMasterGreeting();
              renderActiveView();
              showToast('Database restored successfully from backup!', 'success');
            }
          } else {
            showToast('Invalid backup file structure!', 'danger');
          }
        } catch (err) {
          console.error(err);
          showToast('Failed to parse database backup file!', 'danger');
        }
        
        // Reset file input so same file can be uploaded again
        restoreInput.value = '';
      };
      reader.readAsText(file);
    });
  }
  
  const btnForceUpdate = document.getElementById('btn-force-update');
  if (btnForceUpdate) {
    btnForceUpdate.addEventListener('click', () => {
      const doubleCheck = confirm('Are you sure you want to force Purge and Sync? This will unregister cache workers and reload fresh code assets from server. Your data stored inside local storage WILL remain completely safe!');
      if (doubleCheck) {
        triggerHardRefresh();
      }
    });
  }

  const btnReset = document.getElementById('btn-reset-app');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      const firstCheck = confirm('CRITICAL WARNING: This will factory reset your studio database, deleting all admitted students and past payments logs permanently! Do you wish to continue?');
      if (firstCheck) {
        const doubleCheck = confirm('FINAL CHECK: This action CANNOT BE UNDONE! Are you absolutely sure?');
        if (doubleCheck) {
          localStorage.removeItem(LOCAL_STORAGE_KEY);
          showToast('Studio Database destroyed!', 'danger');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        }
      }
    });
  }
}

// ==================== TOAST NOTIFICATION ACTIONS ====================
window.showToast = function(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Icon selectors
  let icon = '';
  if (type === 'success') {
    icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === 'warning') {
    icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>`;
  } else {
    icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  }
  
  toast.innerHTML = `
    <span style="display:flex; align-items:center; gap:8px;">
      ${icon}
      <span>${message}</span>
    </span>
  `;
  
  container.appendChild(toast);
  
  // Slide In
  setTimeout(() => {
    toast.classList.add('show');
  }, 50);
  
  // Fade out & remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
};

// ==================== BATCH FEES & PACKAGE CONFIGURATION (SETTINGS) ====================
function initSettingsPricingSelector() {
  const batchSelector = document.getElementById('settings-batch-selector');
  const form = document.getElementById('settings-batch-fees-form');
  
  if (!batchSelector || !form) return;
  
  const f1m = document.getElementById('settings-fee-1m');
  const f3m = document.getElementById('settings-fee-3m');
  const f6m = document.getElementById('settings-fee-6m');
  const f12m = document.getElementById('settings-fee-12m');
  
  // Function to load values into form inputs based on selected batch
  function loadBatchPricingValues() {
    const batch = batchSelector.value;
    const pricing = state.batchPricing[batch] || { "1m": 1500, "3m": 4000, "6m": 7500, "12m": 14000 };
    
    f1m.value = pricing["1m"] || 1500;
    f3m.value = pricing["3m"] || 4000;
    f6m.value = pricing["6m"] || 7500;
    f12m.value = pricing["12m"] || 14000;
  }
  
  // Trigger load on dropdown change
  batchSelector.addEventListener('change', loadBatchPricingValues);
  
  // Initial load on launch
  loadBatchPricingValues();
  
  // Form submit handler
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const batch = batchSelector.value;
    
    state.batchPricing[batch] = {
      "1m": parseInt(f1m.value || 0),
      "3m": parseInt(f3m.value || 0),
      "6m": parseInt(f6m.value || 0),
      "12m": parseInt(f12m.value || 0)
    };
    
    saveState();
    showToast(`Saved package rates for ${batch}!`, 'success');
  });
}

// ==================== DYNAMIC PAYMENT DIALOG CALCULATOR ====================
function updateCalculatedPaymentFields() {
  const studentSelect = document.getElementById('payment-student-id');
  const packageSelect = document.getElementById('payment-package');
  const startDateInput = document.getElementById('payment-start-date');
  const endDateInput = document.getElementById('payment-end-date');
  const amountField = document.getElementById('payment-amount');
  
  if (!studentSelect || !packageSelect || !startDateInput || !endDateInput || !amountField) return;
  
  const sId = studentSelect.value;
  const packageVal = packageSelect.value;
  const startDateVal = startDateInput.value;
  
  if (!sId) {
    // No student chosen yet
    return;
  }
  
  const student = state.students.find(s => s.id === sId);
  if (!student) return;
  
  // 1. Fetch pricing configuration for student's batch
  const batch = student.batch || "Kids batch (batch 1)";
  const pricing = state.batchPricing[batch] || { "1m": 1500, "3m": 4000, "6m": 7500, "12m": 14000 };
  
  if (packageVal !== 'custom') {
    // Make end-date and amount read-only or styled, but keep them editable for ultimate custom overrides
    endDateInput.readOnly = false;
    amountField.readOnly = false;
    
    // Auto-calculate end-date
    const calcEnd = calculateEndDateFromStartDate(startDateVal, packageVal);
    if (calcEnd) {
      endDateInput.value = calcEnd;
    }
    
    // Auto-calculate package price
    const calcPrice = pricing[packageVal] || 1500;
    amountField.value = calcPrice;
  } else {
    // Custom period - let user edit freely
    endDateInput.readOnly = false;
    amountField.readOnly = false;
  }
}

// Wire events for payment calculation updates in the form
document.addEventListener('DOMContentLoaded', () => {
  const packageSelect = document.getElementById('payment-package');
  const startDateInput = document.getElementById('payment-start-date');
  
  if (packageSelect) {
    packageSelect.addEventListener('change', updateCalculatedPaymentFields);
  }
  if (startDateInput) {
    startDateInput.addEventListener('change', updateCalculatedPaymentFields);
  }
});
// Fallback direct bindings for modals
setTimeout(() => {
  const pSelect = document.getElementById('payment-package');
  const pStart = document.getElementById('payment-start-date');
  if (pSelect) pSelect.addEventListener('change', updateCalculatedPaymentFields);
  if (pStart) pStart.addEventListener('change', updateCalculatedPaymentFields);
}, 500);

// ==================== ATTENDANCE MODULE ====================

// Returns true if a given date string (YYYY-MM-DD) is a holiday
function isHoliday(dateStr) {
  const d = new Date(dateStr);
  // Check auto-sunday
  if (state.autoSunday && d.getDay() === 0) return true;
  // Check manual holidays list
  return (state.holidays || []).includes(dateStr);
}

// Returns last N class dates (non-holiday days), going backwards from a given date
function getLastClassDates(fromDateStr, count) {
  const dates = [];
  const d = new Date(fromDateStr);
  d.setHours(0, 0, 0, 0);
  let safety = 0;
  while (dates.length < count && safety < 120) {
    const s = d.toISOString().split('T')[0];
    if (!isHoliday(s)) dates.push(s);
    d.setDate(d.getDate() - 1);
    safety++;
  }
  return dates;
}

// Returns consecutive absent count for a student based on actual logged class history
function getConsecutiveAbsences(studentId) {
  const studentRecords = (state.attendance || [])
    .filter(a => a.studentId === studentId && a.status)
    .sort((a, b) => b.date.localeCompare(a.date));

  let count = 0;
  for (const record of studentRecords) {
    if (record.status === 'absent') {
      count++;
    } else {
      break; // present found, streak ends
    }
  }
  return count;
}

// Render Attendance View for selected date
function renderAttendance() {
  const datePicker = document.getElementById('attendance-date-picker');
  if (!datePicker) return;

  // Default to today if no date set
  if (!datePicker.value) {
    datePicker.value = new Date().toISOString().split('T')[0];
  }

  const selectedDate = datePicker.value;
  const container = document.getElementById('attendance-list');
  const summaryText = document.getElementById('att-summary-text');
  const holidayBadge = document.getElementById('att-holiday-badge');
  const searchInput = document.getElementById('attendance-search-input');
  if (!container) return;

  const searchVal = (searchInput ? searchInput.value : '').toLowerCase().trim();
  const isHol = isHoliday(selectedDate);
  const activeStudents = state.students.filter(s => s.status === 'active');

  if (isHol) {
    const dow = new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long' });
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
        <p style="font-weight:700; color:var(--warning-gold); font-size:0.95rem;">${dow} is marked as a Studio Holiday!</p>
        <span style="font-size:0.75rem; color:var(--text-secondary);">No class attendance required for this date.</span>
      </div>
    `;
    if (summaryText) summaryText.textContent = 'Holiday — class suspended';
    if (holidayBadge) holidayBadge.style.display = 'inline-flex';
    return;
  } else {
    if (holidayBadge) holidayBadge.style.display = 'none';
  }

  // Build or reuse attendance map for this date
  if (!container._attendanceMap || container._selectedDate !== selectedDate) {
    container._attendanceMap = {};
    (state.attendance || []).forEach(a => {
      if (a.date === selectedDate) container._attendanceMap[a.studentId] = a.status;
    });
    container._selectedDate = selectedDate;
  }
  const attendanceMap = container._attendanceMap;

  const presentCount = activeStudents.filter(s => attendanceMap[s.id] === 'present').length;
  const absentCount = activeStudents.filter(s => attendanceMap[s.id] === 'absent').length;
  const unmarkedCount = activeStudents.filter(s => !attendanceMap[s.id]).length;

  // Filter list by search query
  let filteredStudents = activeStudents;
  if (searchVal) {
    filteredStudents = activeStudents.filter(s => 
      s.name.toLowerCase().includes(searchVal) ||
      (s.batch && s.batch.toLowerCase().includes(searchVal)) ||
      (s.phone && s.phone.includes(searchVal)) ||
      (s.parentName && s.parentName.toLowerCase().includes(searchVal))
    );
  }

  if (summaryText) {
    summaryText.textContent = `${activeStudents.length} enrolled • ${presentCount} present • ${absentCount} absent${unmarkedCount > 0 ? ` • ${unmarkedCount} pending` : ''}`;
  }

  container.innerHTML = '';

  if (filteredStudents.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>${searchVal ? 'No students match your search.' : 'No active students enrolled yet.'}</p></div>`;
    return;
  }

  filteredStudents.sort((a, b) => a.name.localeCompare(b.name)).forEach(student => {
    const status = attendanceMap[student.id]; // 'present', 'absent', or undefined
    const isPresent = status === 'present';
    const isAbsent = status === 'absent';
    const streak = getConsecutiveAbsences(student.id);

    const card = document.createElement('div');
    card.className = `att-student-card ${isAbsent ? 'status-absent' : (isPresent ? 'status-present' : 'status-unmarked')} animated-fade-in`;
    card.dataset.studentId = student.id;

    const initials = student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const avatarContent = student.photo
      ? `<img src="${student.photo}" alt="${student.name}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
      : `${initials}`;
    
    card.innerHTML = `
      <div class="att-student-left">
        <div class="att-avatar ${isAbsent ? 'absent' : (isPresent ? 'present' : 'unmarked')}">${avatarContent}</div>
        <div class="att-student-info">
          <div class="att-student-name">${student.name}</div>
          <div class="att-student-meta">
            <span>${student.batch || 'General Batch'}</span>
            ${streak >= 2 ? `<span class="att-absence-badge">⚠️ ${streak} Absences</span>` : ''}
          </div>
        </div>
      </div>
      <div class="att-toggle-group">
        <button class="att-toggle-btn ${isPresent ? 'btn-present-active' : ''}" data-sid="${student.id}" data-status="present">
          ✓ P
        </button>
        <button class="att-toggle-btn ${isAbsent ? 'btn-absent-active' : ''}" data-sid="${student.id}" data-status="absent">
          ✕ A
        </button>
      </div>
    `;

    // Toggle button click listeners
    const presentBtn = card.querySelector('.att-toggle-btn[data-status="present"]');
    const absentBtn = card.querySelector('.att-toggle-btn[data-status="absent"]');

    if (presentBtn) {
      presentBtn.addEventListener('click', () => {
        attendanceMap[student.id] = 'present';
        container._attendanceMap = attendanceMap;
        container._selectedDate = selectedDate;
        autoSaveStudentAttendance(selectedDate, student.id, 'present');
        renderAttendance();
      });
    }

    if (absentBtn) {
      absentBtn.addEventListener('click', () => {
        attendanceMap[student.id] = 'absent';
        container._attendanceMap = attendanceMap;
        container._selectedDate = selectedDate;
        autoSaveStudentAttendance(selectedDate, student.id, 'absent');
        renderAttendance();
      });
    }

    container.appendChild(card);
  });

  container._attendanceMap = attendanceMap;
  container._selectedDate = selectedDate;
}

// Auto-save individual student attendance record into global state
function autoSaveStudentAttendance(selectedDate, studentId, status) {
  state.attendance = (state.attendance || []).filter(a => !(a.date === selectedDate && a.studentId === studentId));
  state.attendance.push({ date: selectedDate, studentId, status });
  saveState();

  if (status === 'absent') {
    const consAbsences = getConsecutiveAbsences(studentId);
    if (consAbsences >= 2) {
      const student = state.students.find(s => s.id === studentId);
      if (student) {
        checkAndShowAbsenceAlerts(student, consAbsences);
      }
    }
  }
}

// Check all active students for 2+ consecutive absences and show WhatsApp alert modal
function checkAndShowAbsenceAlerts(targetStudent = null, streakCount = 0) {
  const activeStudents = state.students.filter(s => s.status === 'active');
  let alerts = [];

  if (targetStudent && streakCount >= 2) {
    alerts = [{ student: targetStudent, count: streakCount }];
  } else {
    activeStudents.forEach(student => {
      const count = getConsecutiveAbsences(student.id);
      if (count >= 2) {
        alerts.push({ student, count });
      }
    });
  }

  if (alerts.length === 0) return;

  const list = document.getElementById('absence-alert-list');
  if (!list) return;
  list.innerHTML = '';

  alerts.forEach(({ student, count }) => {
    let cleanPhone = (student.phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const msg = `Hi Sir/Madam, this is a friendly message from Niki Dance Studio (NDS). We noticed that *${student.name}* has not attended classes for *${count} consecutive days*. We miss them in class! Please send them or let us know if everything is okay. Thank you! 🙏`;
    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;

    const initials = student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const avatarContent = student.photo
      ? `<img src="${student.photo}" style="width:38px; height:38px; border-radius:50%; object-fit:cover; flex-shrink:0;">`
      : `<div style="width:38px; height:38px; border-radius:50%; background:rgba(227,28,37,0.15); border:1px solid var(--brand-red); display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700; color:var(--brand-red); flex-shrink:0;">${initials}</div>`;

    const item = document.createElement('div');
    item.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background:rgba(227,28,37,0.08); border-radius:12px; border:1px solid rgba(227,28,37,0.25);';
    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        ${avatarContent}
        <div>
          <div style="font-weight:700; font-size:0.85rem; color:var(--brand-white);">${student.name}</div>
          <div style="font-size:0.72rem; color:var(--brand-red); font-weight:600;">Absent ${count} class${count > 1 ? 'es' : ''} in a row</div>
          <div style="font-size:0.68rem; color:var(--text-secondary);">${student.batch || 'General Batch'} • ${student.phone}</div>
        </div>
      </div>
      <a href="${waUrl}" target="_blank" class="btn btn-primary btn-sm btn-glow" style="background:#25D366; border-color:#25D366; color:#fff; display:inline-flex; align-items:center; gap:5px; padding:6px 12px; font-size:0.75rem; flex-shrink:0;" title="Send WhatsApp message to parent">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
        WhatsApp
      </a>
    `;
    list.appendChild(item);
  });

  openModal('absence-alert-modal');
}

// Initialize attendance tab event listeners
function initAttendance() {
  const datePicker = document.getElementById('attendance-date-picker');
  const searchInput = document.getElementById('attendance-search-input');

  if (datePicker) {
    if (!datePicker.value) {
      datePicker.value = new Date().toISOString().split('T')[0];
    }
    const updateDateAndRender = () => {
      const container = document.getElementById('attendance-list');
      if (container) {
        delete container._attendanceMap;
        delete container._selectedDate;
      }
      renderAttendance();
    };
    datePicker.addEventListener('change', updateDateAndRender);
    datePicker.addEventListener('input', updateDateAndRender);
  }

  if (searchInput) {
    searchInput.addEventListener('input', renderAttendance);
  }
}

// ==================== HOLIDAY SETTINGS MODULE ====================

function renderHolidaysList() {
  const list = document.getElementById('holidays-list');
  const autoCheck = document.getElementById('setting-auto-sunday');
  if (!list) return;

  if (autoCheck) autoCheck.checked = state.autoSunday || false;

  const holidays = (state.holidays || []).sort();
  list.innerHTML = '';

  if (holidays.length === 0) {
    list.innerHTML = '<p style="font-size:0.78rem; color:var(--text-secondary);">No custom holidays added yet.</p>';
    return;
  }

  holidays.forEach(dateStr => {
    const label = new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const chip = document.createElement('div');
    chip.className = 'holiday-chip';
    chip.innerHTML = `
      <span>📅 ${label}</span>
      <button class="holiday-chip-remove" onclick="removeHoliday('${dateStr}')" title="Remove Holiday">✕</button>
    `;
    list.appendChild(chip);
  });
}

function initHolidaySettings() {
  const addBtn = document.getElementById('btn-add-holiday');
  const autoCheck = document.getElementById('setting-auto-sunday');

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const input = document.getElementById('holiday-date-input');
      if (!input || !input.value) { showToast('Please pick a date', 'warning'); return; }
      const dateStr = input.value;
      if (!(state.holidays || []).includes(dateStr)) {
        state.holidays = state.holidays || [];
        state.holidays.push(dateStr);
        saveState();
        showToast('Holiday added!', 'success');
      } else {
        showToast('Already marked as holiday', 'warning');
      }
      input.value = '';
      renderHolidaysList();
    });
  }

  if (autoCheck) {
    autoCheck.addEventListener('change', () => {
      state.autoSunday = autoCheck.checked;
      saveState();
      showToast(state.autoSunday ? 'Sundays auto-marked as holidays' : 'Sunday auto-holiday removed', 'success');
    });
  }
}

window.removeHoliday = function(dateStr) {
  state.holidays = (state.holidays || []).filter(d => d !== dateStr);
  saveState();
  renderHolidaysList();
  showToast('Holiday removed', 'success');
};

// ==================== GOOGLE DRIVE CLOUD BACKUP MODULE ====================

const DEFAULT_GDRIVE_CLIENT_ID = '434441892966-203633m5fa73di5u7al48o4niilu1obh.apps.googleusercontent.com';
const GDRIVE_BACKUP_FILENAME = 'NDS_Database_Backup.json';
let gdriveTokenClient = null;
let autoSyncTimeout = null;

// Initialize Google Drive UI and events
function initGoogleDrive() {
  if (!state.gdrive) {
    state.gdrive = {
      clientId: DEFAULT_GDRIVE_CLIENT_ID,
      autoSync: false,
      accessToken: '',
      tokenExpiry: 0,
      lastSyncTime: null,
      fileId: null,
      userEmail: ''
    };
  } else if (!state.gdrive.clientId) {
    state.gdrive.clientId = DEFAULT_GDRIVE_CLIENT_ID;
  }

  const autoSyncToggle = document.getElementById('gdrive-auto-sync-toggle');
  const connectBtn = document.getElementById('btn-gdrive-connect');
  const disconnectBtn = document.getElementById('btn-gdrive-disconnect');
  const backupNowBtn = document.getElementById('btn-gdrive-backup-now');
  const restoreNowBtn = document.getElementById('btn-gdrive-restore-now');

  if (autoSyncToggle) {
    autoSyncToggle.checked = !!state.gdrive.autoSync;
    autoSyncToggle.addEventListener('change', () => {
      state.gdrive.autoSync = autoSyncToggle.checked;
      saveState();
      if (state.gdrive.autoSync) {
        showToast('Auto-backup to Google Drive enabled', 'success');
        if (isGoogleDriveConnected()) {
          uploadToGoogleDrive(false);
        } else {
          showToast('Connect Google Drive to start syncing', 'warning');
        }
      } else {
        showToast('Auto-backup disabled', 'info');
      }
    });
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', () => connectGoogleDrive(true));
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', disconnectGoogleDrive);
  }

  if (backupNowBtn) {
    backupNowBtn.addEventListener('click', () => uploadToGoogleDrive(true));
  }

  if (restoreNowBtn) {
    restoreNowBtn.addEventListener('click', restoreFromGoogleDrive);
  }

  updateGoogleDriveUI();
}

function isGoogleDriveConnected() {
  return !!(state.gdrive && state.gdrive.accessToken && state.gdrive.tokenExpiry > Date.now());
}

function updateGoogleDriveUI() {
  const statusBadge = document.getElementById('gdrive-status-badge');
  const connectBtn = document.getElementById('btn-gdrive-connect');
  const connectedDetails = document.getElementById('gdrive-connected-details');
  const actionsRow = document.getElementById('gdrive-actions-row');
  const accountEmail = document.getElementById('gdrive-account-email');
  const lastSyncText = document.getElementById('gdrive-last-sync-text');
  const autoSyncToggle = document.getElementById('gdrive-auto-sync-toggle');

  const connected = isGoogleDriveConnected();

  if (statusBadge) {
    if (connected) {
      statusBadge.textContent = 'Connected';
      statusBadge.className = 'badge badge-success';
    } else {
      statusBadge.textContent = 'Disconnected';
      statusBadge.className = 'badge badge-outline';
    }
  }

  if (connectBtn) {
    connectBtn.style.display = connected ? 'none' : 'flex';
  }

  if (connectedDetails) {
    connectedDetails.style.display = connected ? 'block' : 'none';
  }

  if (actionsRow) {
    actionsRow.style.display = connected ? 'flex' : 'none';
  }

  if (accountEmail && state.gdrive) {
    accountEmail.textContent = state.gdrive.userEmail || 'Google Account';
  }

  if (lastSyncText && state.gdrive) {
    if (state.gdrive.lastSyncTime) {
      const syncDate = new Date(state.gdrive.lastSyncTime);
      lastSyncText.textContent = syncDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      lastSyncText.textContent = 'Never';
    }
  }

  if (autoSyncToggle && state.gdrive) {
    autoSyncToggle.checked = !!state.gdrive.autoSync;
  }
}

// Trigger Google OAuth 2.0 Token Flow via Google Identity Services
function connectGoogleDrive(triggerInitialSync = true) {
  const clientId = (state.gdrive && state.gdrive.clientId) || DEFAULT_GDRIVE_CLIENT_ID;

  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    showToast('Google Identity Services loading. Please retry in a moment.', 'warning');
    return;
  }

  try {
    gdriveTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      callback: async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          state.gdrive.accessToken = tokenResponse.access_token;
          state.gdrive.tokenExpiry = Date.now() + (parseInt(tokenResponse.expires_in || 3600) - 60) * 1000;

          // Fetch user profile email
          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
            });
            if (userRes.ok) {
              const userData = await userRes.json();
              state.gdrive.userEmail = userData.email || '';
            }
          } catch (e) {
            console.warn('Could not fetch user email', e);
          }

          saveState();
          updateGoogleDriveUI();
          showToast(`Connected to Google Drive (${state.gdrive.userEmail || 'Success'})!`, 'success');

          // Immediately sync current existing data to Google Drive
          if (triggerInitialSync) {
            uploadToGoogleDrive(false);
          }
        } else {
          showToast('Google authentication failed or cancelled', 'danger');
        }
      },
      error_callback: (err) => {
        console.error('Google OAuth error:', err);
        showToast('Google authentication error: ' + (err.message || 'Please check Client ID'), 'danger');
      }
    });

    gdriveTokenClient.requestAccessToken({ prompt: '' });
  } catch (err) {
    console.error('Failed to init Google OAuth token client', err);
    showToast('OAuth initialization error. Please verify Client ID.', 'danger');
  }
}

// Disconnect Google Drive
function disconnectGoogleDrive() {
  if (state.gdrive && state.gdrive.accessToken) {
    try {
      if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        google.accounts.oauth2.revoke(state.gdrive.accessToken);
      }
    } catch (e) {}
  }

  if (state.gdrive) {
    state.gdrive.accessToken = '';
    state.gdrive.tokenExpiry = 0;
    state.gdrive.userEmail = '';
  }

  saveState();
  updateGoogleDriveUI();
  showToast('Disconnected from Google Drive', 'info');
}

// Upload current NDS state JSON into Google Drive
async function uploadToGoogleDrive(isManual = false) {
  if (!isGoogleDriveConnected()) {
    if (isManual) {
      connectGoogleDrive(true);
    }
    return;
  }

  const token = state.gdrive.accessToken;
  const backupPayload = JSON.stringify(state, null, 2);

  if (isManual) {
    showToast('Uploading backup to Google Drive...', 'info');
  }

  try {
    // 1. Search if NDS_Database_Backup.json already exists in user's Drive
    let fileId = state.gdrive.fileId;
    if (!fileId) {
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${GDRIVE_BACKUP_FILENAME}' and trashed=false&fields=files(id,name)&spaces=drive`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          fileId = searchData.files[0].id;
          state.gdrive.fileId = fileId;
        }
      }
    }

    let uploadRes;
    if (fileId) {
      // Update existing file content
      uploadRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: backupPayload
        }
      );
    } else {
      // Create new backup file in Google Drive
      const metadata = {
        name: GDRIVE_BACKUP_FILENAME,
        mimeType: 'application/json',
        description: 'Niki Dance Studio Database Cloud Backup'
      };

      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const closeDelim = "\r\n--" + boundary + "--";

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        backupPayload +
        closeDelim;

      uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/related; boundary=' + boundary
          },
          body: multipartRequestBody
        }
      );
    }

    if (uploadRes.ok) {
      const data = await uploadRes.json();
      state.gdrive.fileId = data.id || fileId;
      state.gdrive.lastSyncTime = new Date().toISOString();
      saveState();
      updateGoogleDriveUI();

      if (isManual) {
        showToast('Google Drive backup saved successfully! ☁️', 'success');
      }
    } else if (uploadRes.status === 401) {
      // Token expired, clear token and prompt reconnect
      state.gdrive.accessToken = '';
      state.gdrive.tokenExpiry = 0;
      saveState();
      updateGoogleDriveUI();
      if (isManual) {
        showToast('Google session expired. Reconnecting...', 'warning');
        connectGoogleDrive(true);
      }
    } else {
      const errText = await uploadRes.text();
      console.error('Google Drive Upload Failed', errText);
      if (isManual) showToast('Cloud upload failed. Please try again.', 'danger');
    }
  } catch (err) {
    console.error('Google Drive sync error:', err);
    if (isManual) showToast('Google Drive connection error', 'danger');
  }
}

// Restore Database from Google Drive
async function restoreFromGoogleDrive() {
  if (!isGoogleDriveConnected()) {
    connectGoogleDrive(false);
    return;
  }

  const token = state.gdrive.accessToken;
  showToast('Checking Google Drive for backups...', 'info');

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${GDRIVE_BACKUP_FILENAME}' and trashed=false&fields=files(id,name,modifiedTime)&spaces=drive`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!searchRes.ok) {
      showToast('Could not search Google Drive files', 'danger');
      return;
    }

    const searchData = await searchRes.json();
    if (!searchData.files || searchData.files.length === 0) {
      showToast('No NDS backup file found on your Google Drive', 'warning');
      return;
    }

    const file = searchData.files[0];
    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!fileRes.ok) {
      showToast('Failed to download backup from Google Drive', 'danger');
      return;
    }

    const backupData = await fileRes.json();
    if (!backupData || !Array.isArray(backupData.students)) {
      showToast('Invalid backup file format on Google Drive', 'danger');
      return;
    }

    const modTime = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString('en-IN') : 'Recent';
    const confirmRestore = confirm(`Found cloud backup from ${modTime} with ${backupData.students.length} students. Restoring will merge/update your local database. Proceed?`);

    if (confirmRestore) {
      // Preserve current gdrive configuration
      const currentGdrive = { ...state.gdrive };

      state = {
        masterName: backupData.masterName || state.masterName,
        students: backupData.students || [],
        payments: backupData.payments || [],
        attendance: backupData.attendance || [],
        holidays: backupData.holidays || [],
        autoSunday: backupData.autoSunday || false,
        batchPricing: backupData.batchPricing || state.batchPricing,
        gdrive: currentGdrive
      };

      state.gdrive.lastSyncTime = new Date().toISOString();
      state.gdrive.fileId = file.id;

      saveState();
      updateMasterGreeting();
      renderActiveView();
      updateGoogleDriveUI();

      showToast('Database successfully restored from Google Drive! ☁️', 'success');
    }
  } catch (err) {
    console.error('Google Drive Restore Error:', err);
    showToast('Failed to restore from Google Drive: ' + err.message, 'danger');
  }
}

// Debounced background auto-sync function
function triggerAutoSyncGoogleDrive() {
  if (!state.gdrive || !state.gdrive.autoSync || !isGoogleDriveConnected()) return;

  if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
  autoSyncTimeout = setTimeout(() => {
    uploadToGoogleDrive(false);
  }, 2500); // 2.5s debounce
}


