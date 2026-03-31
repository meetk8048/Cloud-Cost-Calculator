/* ==============================================
   CLOUD COST CALCULATOR — app.js
   All calculation, chart rendering, and
   save/load logic for the calculator.
   Currency: INR (Indian Rupees ₹)
   Exchange rate used: 1 USD ≈ ₹83.5
   ============================================== */

/* ---------- STATE ---------- */
let period = 'monthly';
let pieChart = null;
let barChart = null;
let savedEstimates = JSON.parse(localStorage.getItem('cloudEstimatesINR') || '[]');

/* ---------- PRICING CONSTANTS (INR) ---------- */
const PRICING = {
  compute: {
    basic:       1.67,   // ₹ per hour  ($0.02 × 83.5)
    standard:    4.17,   // ₹ per hour  ($0.05 × 83.5)
    highPerf:    8.34,   // ₹ per hour  ($0.10 × 83.5)
  },
  storage: {
    hdd:         0.84,   // ₹ per GB    ($0.01 × 83.5)
    ssd:         1.67,   // ₹ per GB    ($0.02 × 83.5)
  },
  transfer: {
    usEu:        6.68,   // ₹ per GB    ($0.08 × 83.5)
    asiaPacific: 10.01,  // ₹ per GB    ($0.12 × 83.5)
    southAmerica:13.35,  // ₹ per GB    ($0.16 × 83.5)
  }
};

/* Provider cost multipliers relative to AWS baseline */
const PROVIDER_MULTIPLIERS = {
  aws:   { compute: 1.00, storage: 1.00, transfer: 1.00 },
  azure: { compute: 1.08, storage: 0.95, transfer: 1.05 },
  gcp:   { compute: 0.95, storage: 1.10, transfer: 0.92 },
};

/* ---------- FORMATTING HELPERS ---------- */

/**
 * Format a rupee amount with Indian shorthand.
 * e.g. 1500 → ₹1.5k | 150000 → ₹1.50L | 15000000 → ₹1.50Cr
 */
function fmt(n) {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + 'Cr';
  if (n >= 100000)   return '₹' + (n / 100000).toFixed(2) + 'L';
  if (n >= 1000)     return '₹' + (n / 1000).toFixed(1) + 'k';
  return '₹' + Math.round(n);
}

/**
 * Format a rupee amount in full Indian number format.
 * e.g. 123456 → ₹1,23,456
 */
function fmtFull(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

/* ---------- UI HELPERS ---------- */

/**
 * Update a range slider's value display and badge text.
 * @param {HTMLElement} el      - The <input type="range"> element
 * @param {string}      badgeId - ID of the badge span to update
 * @param {Function}    labelFn - Function that turns the numeric value into a label string
 */
function updateSlider(el, badgeId, labelFn) {
  const v = parseFloat(el.value);
  document.getElementById(el.id + '-val').textContent = v.toLocaleString();
  document.getElementById(badgeId).textContent = labelFn(v);
}

/**
 * Switch between monthly and yearly billing.
 * @param {string} p - 'monthly' or 'yearly'
 */
function setPeriod(p) {
  period = p;
  document.getElementById('btn-monthly').className = 'toggle-btn' + (p === 'monthly' ? ' active' : '');
  document.getElementById('btn-yearly').className  = 'toggle-btn' + (p === 'yearly'  ? ' active' : '');
  calc();
}

/* ---------- CORE CALCULATION ---------- */

/**
 * Read all inputs, compute costs, and update the UI.
 * Called on every slider/dropdown change.
 *
 * Formulas:
 *   Compute Cost  = Hourly Rate (₹) × Hours Used per Month
 *   Storage Cost  = Rate per GB (₹) × Storage Size (GB)
 *   Transfer Cost = Rate per GB (₹) × Data Transferred (GB)
 *   Total         = Compute + Storage + Transfer
 *   Yearly        = Monthly × 12
 */
function calc() {
  /* Read values */
  const hourlyRate  = parseFloat(document.getElementById('instanceType').value);
  const hours       = parseFloat(document.getElementById('hours').value);
  const storageRate = parseFloat(document.getElementById('storageType').value);
  const storageGB   = parseFloat(document.getElementById('storageSize').value);
  const transferRate= parseFloat(document.getElementById('region').value);
  const transferGB  = parseFloat(document.getElementById('dataTransfer').value);

  /* Monthly costs */
  let compute  = hourlyRate  * hours;
  let storage  = storageRate * storageGB;
  let transfer = transferRate* transferGB;
  let total    = compute + storage + transfer;

  /* Scale to yearly if needed */
  if (period === 'yearly') {
    compute  *= 12;
    storage  *= 12;
    transfer *= 12;
    total    *= 12;
  }

  /* Percentage of total for each category */
  const pctOf = v => total > 0 ? Math.round(v / total * 100) + '%' : '0%';

  /* Update total card */
  document.getElementById('total-display').textContent = fmt(total);
  document.getElementById('total-label').textContent   = period === 'yearly' ? 'Estimated Yearly Cost' : 'Estimated Monthly Cost';
  document.getElementById('total-period').textContent  = period === 'yearly' ? 'per year' : 'per month';

  /* Update breakdown */
  document.getElementById('compute-cost').textContent  = fmtFull(compute);
  document.getElementById('storage-cost').textContent  = fmtFull(storage);
  document.getElementById('transfer-cost').textContent = fmtFull(transfer);
  document.getElementById('compute-pct').textContent   = '(' + pctOf(compute)  + ')';
  document.getElementById('storage-pct').textContent   = '(' + pctOf(storage)  + ')';
  document.getElementById('transfer-pct').textContent  = '(' + pctOf(transfer) + ')';

  /* Update charts and provider cards */
  updatePieChart(compute, storage, transfer);
  updateProviders(compute, storage, transfer);
}

/* ---------- PIE / DOUGHNUT CHART ---------- */

/**
 * Create or update the doughnut chart showing cost breakdown.
 */
function updatePieChart(compute, storage, transfer) {
  const data = [compute, storage, transfer];

  if (!pieChart) {
    pieChart = new Chart(document.getElementById('pieChart'), {
      type: 'doughnut',
      data: {
        labels: ['Compute', 'Storage', 'Transfer'],
        datasets: [{
          data,
          backgroundColor: ['#f5c800', '#aaaaaa', '#444444'],
          borderColor: '#ffffff',
          borderWidth: 3,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ' ' + ctx.label + ': ₹' + Math.round(ctx.parsed).toLocaleString('en-IN')
            }
          }
        }
      }
    });
  } else {
    pieChart.data.datasets[0].data = data;
    pieChart.update('none');
  }
}

/* ---------- PROVIDER COMPARISON ---------- */

/**
 * Calculate and display costs for AWS, Azure, and GCP.
 * Uses relative multipliers applied to the base (AWS) figures.
 */
function updateProviders(compute, storage, transfer) {
  const providers = ['aws', 'azure', 'gcp'];
  const totals = {};

  for (const p of providers) {
    const m = PROVIDER_MULTIPLIERS[p];
    const c = compute  * m.compute;
    const s = storage  * m.storage;
    const t = transfer * m.transfer;
    const total = c + s + t;

    totals[p] = total;

    document.getElementById(p + '-price').textContent    = fmt(total);
    document.getElementById(p + '-compute').textContent  = fmtFull(c);
    document.getElementById(p + '-storage').textContent  = fmtFull(s);
    document.getElementById(p + '-transfer').textContent = fmtFull(t);
  }

  /* Mark cheapest provider with "Best Value" badge */
  const cheapest = Object.entries(totals).sort((a, b) => a[1] - b[1])[0][0];
  const defaultTags = { aws: 'Cheapest', azure: 'Most Popular', gcp: 'Premium' };

  for (const p of providers) {
    const el = document.getElementById(p + '-tag');
    if (p === cheapest) {
      el.textContent = '✓ Best Value';
      el.className = 'compare-tag cheapest';
    } else {
      el.textContent = defaultTags[p];
      el.className = 'compare-tag ' + (p === 'azure' ? 'popular' : 'premium');
    }
  }

  updateBarChart(totals);
}

/* ---------- BAR CHART ---------- */

/**
 * Create or update the bar chart comparing provider totals.
 */
function updateBarChart(totals) {
  const data = [totals.aws, totals.azure, totals.gcp];

  if (!barChart) {
    barChart = new Chart(document.getElementById('barChart'), {
      type: 'bar',
      data: {
        labels: ['AWS', 'Azure', 'GCP'],
        datasets: [{
          label: 'Total Cost (INR)',
          data,
          backgroundColor: [
            'rgba(245, 200, 0, 0.85)',
            'rgba(30, 30, 30, 0.75)',
            'rgba(140, 140, 140, 0.65)',
          ],
          borderColor: ['#c9a200', '#000000', '#888888'],
          borderWidth: 1.5,
          borderRadius: 8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ' ₹' + Math.round(ctx.parsed.y).toLocaleString('en-IN')
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(0, 0, 0, 0.05)' },
            ticks: { color: '#555', font: { family: 'Syne', size: 13, weight: '600' } }
          },
          y: {
            grid: { color: 'rgba(0, 0, 0, 0.05)' },
            beginAtZero: true,
            ticks: {
              color: '#666',
              font: { family: 'DM Mono', size: 12 },
              callback: v => v >= 1000 ? '₹' + (v / 1000).toFixed(0) + 'k' : '₹' + v
            }
          }
        }
      }
    });
  } else {
    barChart.data.datasets[0].data = data;
    barChart.update('none');
  }
}

/* ---------- TOAST NOTIFICATIONS ---------- */

/**
 * Show a toast message at the bottom-right.
 * @param {string} msg  - Message text
 * @param {string} type - 'success' | 'info'
 */
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => { t.className = 'toast'; }, 2800);
}

/* ---------- SAVE / LOAD ESTIMATES ---------- */

/**
 * Save the current calculator state to localStorage.
 */
function saveEstimate() {
  const total        = document.getElementById('total-display').textContent;
  const now          = new Date();
  const instanceEl   = document.getElementById('instanceType');
  const storageEl    = document.getElementById('storageType');
  const instanceName = instanceEl.options[instanceEl.selectedIndex].text.split('—')[0].trim();
  const storageName  = storageEl.options[storageEl.selectedIndex].text.split('—')[0].trim();

  const estimate = {
    id:       Date.now(),
    name:     instanceName + ' — ' + storageName,
    total,
    period,
    date:     now.toLocaleDateString('en-IN'),
    compute:  document.getElementById('compute-cost').textContent,
    storage:  document.getElementById('storage-cost').textContent,
    transfer: document.getElementById('transfer-cost').textContent,
  };

  savedEstimates.unshift(estimate);
  if (savedEstimates.length > 10) savedEstimates.pop(); // Keep max 10 estimates

  localStorage.setItem('cloudEstimatesINR', JSON.stringify(savedEstimates));
  renderSaved();
  showToast('✅ Estimate saved!');
}

/**
 * Delete a single saved estimate by its ID.
 * @param {number} id
 */
function deleteEstimate(id) {
  savedEstimates = savedEstimates.filter(e => e.id !== id);
  localStorage.setItem('cloudEstimatesINR', JSON.stringify(savedEstimates));
  renderSaved();
  showToast('Estimate removed', 'info');
}

/**
 * Clear all saved estimates from localStorage.
 */
function clearSaved() {
  savedEstimates = [];
  localStorage.removeItem('cloudEstimatesINR');
  renderSaved();
  showToast('All estimates cleared', 'info');
}

/**
 * Render the saved estimates list in the DOM.
 */
function renderSaved() {
  const el = document.getElementById('saved-list');

  if (!savedEstimates.length) {
    el.innerHTML = '<div class="no-saves">No estimates saved yet. Configure your infrastructure and save!</div>';
    return;
  }

  el.innerHTML = savedEstimates.map(e => `
    <div class="saved-item">
      <div>
        <div class="saved-item-name">${e.name}</div>
        <div class="saved-item-info">
          ${e.date} &middot; ${e.period}
          &middot; Compute: ${e.compute}
          &middot; Storage: ${e.storage}
          &middot; Transfer: ${e.transfer}
        </div>
      </div>
      <div class="saved-item-actions">
        <div class="saved-item-cost">${e.total}</div>
        <button class="icon-btn" onclick="deleteEstimate(${e.id})" title="Delete">&#128465;</button>
      </div>
    </div>
  `).join('');
}

/* ---------- INIT ---------- */
renderSaved();
calc();
