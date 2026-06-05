// NDS - Student & Fee Tracker - Core Application Logic

// ==================== STATE MANAGEMENT ====================
let state = {
  masterName: '',
  students: [],
  payments: [],
  batchPricing: {
    "Kids batch (batch 1)": { "1m": 1500, "3m": 4000, "6m": 7500, "12m": 14000 },
    "Intermediate (batch 2)": { "1m": 2000, "3m": 5500, "6m": 10000, "12m": 19000 },
    "Advanced batch (batch 3)": { "1m": 2500, "3m": 7000, "6m": 13000, "12m": 25000 },
    "Gymnastics batch": { "1m": 1800, "3m": 5000, "6m": 9000, "12m": 17000 },
    "Zumba batch": { "1m": 1500, "3m": 4000, "6m": 7500, "12m": 14000 }
  }
};

// Default Database Schema
const DEFAULT_STATE = {
  masterName: '',
  students: [],
  payments: [],
  batchPricing: {
    "Kids batch (batch 1)": { "1m": 1500, "3m": 4000, "6m": 7500, "12m": 14000 },
    "Intermediate (batch 2)": { "1m": 2000, "3m": 5500, "6m": 10000, "12m": 19000 },
    "Advanced batch (batch 3)": { "1m": 2500, "3m": 7000, "6m": 13000, "12m": 25000 },
    "Gymnastics batch": { "1m": 1800, "3m": 5000, "6m": 9000, "12m": 17000 },
    "Zumba batch": { "1m": 1500, "3m": 4000, "6m": 7500, "12m": 14000 }
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
  // Force reset document and body scroll positions to combat mobile browser reload shifts
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  if (document.documentElement) {
    document.documentElement.scrollTop = 0;
  }
  
  initApp();
  registerServiceWorker();
  initViewRouting();
  initFormsAndModals();
  initDataAdministration();
  initPullToRefresh();
  initDashboardToggle(); // Wire up dashboard toggles
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
      // Ensure arrays exist
      state.students = state.students || [];
      state.payments = state.payments || [];
      state.masterName = state.masterName || '';
      
      // Fallback fallback upgrade if legacy local storage doesn't have batchPricing
      if (!state.batchPricing) {
        state.batchPricing = { ...DEFAULT_STATE.batchPricing };
      }
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
          batchPricing: { ...DEFAULT_STATE.batchPricing }
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

// Save DB State to LocalStorage
function saveState() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
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
  // Show / Hide Floating Action Buttons programmatically based on active view
  const fabAddStudent = document.getElementById('fab-add-student');
  const fabLogPayment = document.getElementById('fab-log-payment');
  
  if (fabAddStudent) {
    fabAddStudent.style.display = (currentView === 'students') ? 'flex' : 'none';
  }
  if (fabLogPayment) {
    fabLogPayment.style.display = (currentView === 'history') ? 'flex' : 'none';
  }

  switch (currentView) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'students':
      renderStudents();
      break;
    case 'history':
      renderHistory();
      break;
    case 'settings':
      // Handled statically, just ensure fields are synced
      updateMasterGreeting();
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
    
    card.innerHTML = `
      <div class="student-card-left">
        <div class="student-avatar ${isStudentActive ? 'active-student' : ''}">
          <span class="student-avatar-letter">${initials}</span>
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
  document.getElementById('detail-avatar-letter').textContent = initials;
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

// ==================== FORMS AND MODALS MANAGEMENT ====================
function initFormsAndModals() {
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
            status
          };
          showToast(`${name} profiles updated!`, 'success');
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
