// ======= PERFORMANCE OPTIMIZATIONS =======
// Preload critical resources
const preloadCriticalResources = () => {
  if (typeof document === 'undefined') return;
  
  const criticalResources = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.tailwindcss.com'
  ];
  
  criticalResources.forEach(url => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = url;
    link.as = 'style';
    document.head.appendChild(link);
  });
};

// Efficient DOM update batching
const batchedUpdates = {
  queue: [],
  scheduled: false,
  
  add(callback) {
    this.queue.push(callback);
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => this.flush());
    }
  },
  
  flush() {
    const queue = this.queue;
    this.queue = [];
    this.scheduled = false;
    
    queue.forEach(callback => callback());
  }
};

// ======= DATA & INIT =======
const kategoriDonatur = {
  kategori1: [
    "Mas Ani", "Pak Kholis", "Pak Hasyim", "Amat", "Mbak Is", "Dani", 
    "Pak Napi", "Pak Ipin", "Mas Agus BZ", "Pak Fat", "Pak Ropi", 
    "Mas Umam", "Pak Kisman", "Pak Yanto", "Pak Pardi", "Pak Salam", 
    "Pak Piyan", "Pak Slamet", "Pak Ibin", "Idek", "Pak Ngari", 
    "Pak Tukhin", "Pak Rofiq", "Pak Syafak", "Pak Jubaidi", "Mbak Kholis", 
    "Pak Kholiq", "Pak Rokhan", "Mas Agus", "Mas Izin", "Pak Abror", 
    "Mas Gustaf"
  ],
  kategori2: ["Pak A", "Pak B", "Pak C"],
  kategori3: ["Pak A", "Pak B", "Pak C"],
};

const kategoriLabel = {
  kategori1: "RT Tengah",
  kategori2: "RT Kulon", 
  kategori3: "RT Kidul",
};

let dataDonasi = [];
let sudahUploadHariIni = {
  kategori1: false,
  kategori2: false,
  kategori3: false,
};

// Track donatur yang sudah diinput per kategori
let donaturTerinput = {
  kategori1: new Set(),
  kategori2: new Set(),
  kategori3: new Set(),
};

// URL untuk upload (akan digunakan ketika online)
const UPLOAD_URL = "https://input.pnakote.my.id/upload";

// Cache DOM elements
let cachedElements = {};

// Database instance
let db;

// ======= INITIALIZATION =======
// ======= INITIALIZATION =======
document.addEventListener('DOMContentLoaded', async function() {
  try {
    // Initialize performance optimizations
    preloadCriticalResources();
    
    // Initialize database
    db = jimpitanDB;
    await db.init();
    console.log('✅ Database initialized successfully');
    
    // Check if we have offline data to sync
    await checkOfflineData();
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    showNotification('Gagal menginisialisasi penyimpanan offline', false);
  }

  // Initialize cached DOM elements
  initializeCachedElements();
  
  // Load initial data menggunakan batched updates
  batchedUpdates.add(async () => {
    await muatDropdown('kategori1');
    await checkUploadStatus();
    await loadDataHariIni('kategori1');
    updateUploadButtonState();
  });

  // Add event listeners
  setupEventListeners();
});
function initializeCachedElements() {
  cachedElements = {
    tanggalHariIni: document.getElementById('tanggalHariIni'),
    notifikasi: document.getElementById('notifikasi'),
    kategoriDonatur: document.getElementById('kategoriDonatur'),
    donatur: document.getElementById('donatur'),
    pemasukan: document.getElementById('pemasukan'),
    btnTambah: document.getElementById('btnTambah'),
    btnUpload: document.getElementById('btnUpload'),
    btnHapus: document.getElementById('btnHapus'),
    tabelDonasi: document.getElementById('tabelDonasi'),
    totalDonasi: document.getElementById('totalDonasi'),
    uploadStatus: document.getElementById('uploadStatus'),
    uploadInfo: document.getElementById('uploadInfo'),
    networkStatus: document.getElementById('networkStatus'),
    dataCount: document.getElementById('dataCount'),
    btnRefresh: document.getElementById('btnRefresh')
  };
}

function setupEventListeners() {
  cachedElements.btnTambah.addEventListener('click', tambahData);
  cachedElements.btnUpload.addEventListener('click', uploadToGoogleSheets);
  cachedElements.btnHapus.addEventListener('click', hapusDataHariIni);

  // KEMBALI KE LOGIKA ORIGINAL - dropdown langsung berubah saat kategori dipilih
  cachedElements.kategoriDonatur.addEventListener('change', async function() {
    const kategori = this.value;
    
    // Tampilkan loading state
    showNotification('🔄 Memuat data...', true);
    
    // Muat dropdown dan data secara bersamaan
    await Promise.all([
      muatDropdown(kategori),
      loadDataHariIni(kategori)
    ]);
    
    checkUploadStatus();
    updateUploadButtonState();
    
    // Sembunyikan loading state
    setTimeout(() => {
      const notif = cachedElements.notifikasi;
      if (notif.textContent.includes('Memuat data')) {
        notif.textContent = '';
        notif.className = 'mb-4 md:mb-6 text-center p-3 md:p-4 rounded-xl transition-all duration-300';
      }
    }, 1000);
  });

  // Quick amount buttons
  document.querySelectorAll('.quick-amount').forEach(button => {
    button.addEventListener('click', function() {
      const amount = this.getAttribute('data-amount');
      document.getElementById('pemasukan').value = amount;
      document.getElementById('pemasukan').focus();
    });
  });

  // Auto-focus on input field
  cachedElements.pemasukan.focus();
}

// ======= OFFLINE DATA MANAGEMENT =======
async function checkOfflineData() {
  try {
    const queue = await db.getUploadQueue();
    if (queue.length > 0) {
      showNotification(`📦 Ada ${queue.length} data offline yang tersimpan`, true);
      
      // If online, attempt to sync
      if (navigator.onLine) {
        showNotification('🔄 Menyinkronkan data offline...', true);
        await syncOfflineData();
      }
    }
  } catch (error) {
    console.error('Error checking offline data:', error);
  }
}

// Make sync function available globally
window.syncOfflineData = async function() {
  try {
    const queue = await db.getUploadQueue();
    if (queue.length === 0) return;

    showNotification(`🔄 Menyinkronkan ${queue.length} data offline...`, true);
    
    let successCount = 0;
    let failCount = 0;

    for (const item of queue) {
      if (item.attempts < 3) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(UPLOAD_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(item.data),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            await db.removeFromUploadQueue(item.id);
            successCount++;
            console.log('✅ Successfully synced offline data:', item.id);
          } else {
            // Increment attempts on failure
            await db.updateUploadQueueAttempts(item.id, item.attempts + 1);
            failCount++;
          }
        } catch (error) {
          console.error('❌ Failed to sync item:', item.id, error);
          await db.updateUploadQueueAttempts(item.id, item.attempts + 1);
          failCount++;
        }
      } else {
        // Too many attempts, remove from queue
        await db.removeFromUploadQueue(item.id);
        console.log('🗑️ Removed item after too many attempts:', item.id);
        failCount++;
      }
    }

    if (successCount > 0) {
      showNotification(`✅ ${successCount} data berhasil disinkronkan`, true);
    }
    if (failCount > 0) {
      showNotification(`❌ ${failCount} data gagal disinkronkan`, false);
    }

  } catch (error) {
    console.error('Error syncing offline data:', error);
    showNotification('Gagal menyinkronkan data offline', false);
  }
};

// ======= DATA LOADING =======
async function loadDataHariIni(kategori) {
  try {
    const today = new Date().toLocaleDateString('id-ID');
    const savedData = await db.getDailyInputs(kategori, today);
    
    console.log('📥 Loading saved data for today:', savedData);
    
    dataDonasi = savedData.map(item => ({
      donatur: item.donatur,
      nominal: item.nominal,
      tanggal: item.tanggal,
      id: item.id // Store ID for updates
    }));

    // Update donaturTerinput
    donaturTerinput[kategori] = new Set();
    dataDonasi.forEach(item => {
      donaturTerinput[kategori].add(item.donatur);
    });

    renderTabelTerurut(kategori);
    updateTotalDisplay();
    updateUploadButtonState();
    updateDataCount();
    
    if (dataDonasi.length > 0) {
      showNotification(`📊 Memuat ${dataDonasi.length} data tersimpan`, true);
    }
  } catch (error) {
    console.error('❌ Error loading data:', error);
    dataDonasi = [];
    donaturTerinput[kategori] = new Set();
    showNotification('Gagal memuat data tersimpan', false);
  }
}

function updateDataCount() {
  if (cachedElements.dataCount) {
    cachedElements.dataCount.textContent = `${dataDonasi.length} data`;
  }
}

// ======= CORE FUNCTIONS =======
async function tambahData() {
  const donatur = cachedElements.donatur.value;
  const nominal = cachedElements.pemasukan.value;
  const kategori = cachedElements.kategoriDonatur.value;

  if (!donatur || donatur === '' || nominal === '') {
    showNotification('Nama dan nominal tidak boleh kosong', false);
    return;
  }

  const tanggal = new Date().toLocaleDateString('id-ID');

  try {
    // Cek apakah donatur sudah ada di dataDonasi
    const existingIndex = dataDonasi.findIndex(item => item.donatur === donatur);
    
    if (existingIndex !== -1) {
      // Update existing data
      const existingId = dataDonasi[existingIndex].id;
      dataDonasi[existingIndex].nominal = nominal;
      dataDonasi[existingIndex].tanggal = tanggal;
      
      // Update in database
      if (existingId) {
        await db.updateDailyInput(existingId, { nominal, tanggal });
      }
      
      showNotification(`✏️ Data ${donatur} diperbarui`, true);
    } else {
      // Tambah data baru
      const newData = { donatur, nominal, tanggal, kategori };
      const newId = await db.saveDailyInput(newData);
      newData.id = newId;
      
      dataDonasi.push(newData);
      donaturTerinput[kategori].add(donatur);
      
      // Tampilkan notifikasi berbeda untuk nominal 0
      if (parseInt(nominal) === 0) {
        showNotification(`✅ Data ${donatur} disimpan (tidak mengisi)`, true);
      } else {
        showNotification(`✅ Data ${donatur} berhasil disimpan`, true);
      }
    }

    // Render ulang tabel dengan urutan yang benar
    renderTabelTerurut(kategori);

    // Refresh dropdown untuk menampilkan donatur berikutnya
    await muatDropdown(kategori);

    cachedElements.pemasukan.value = '';
    updateTotalDisplay();
    updateUploadButtonState();
    updateDataCount();

    // Auto-focus kembali ke input nominal untuk input berikutnya
    setTimeout(() => {
      cachedElements.pemasukan.focus();
    }, 100);

  } catch (error) {
    console.error('❌ Error saving data:', error);
    showNotification('Gagal menyimpan data', false);
  }
}

async function uploadToGoogleSheets() {
  const kategori = cachedElements.kategoriDonatur.value;

  if (sudahUploadHariIni[kategori]) {
    showUploadStatus(
      'Anda sudah melakukan upload hari ini untuk kategori ini. Upload hanya dapat dilakukan sekali per hari.',
      false
    );
    return;
  }

  if (dataDonasi.length === 0) {
    showUploadStatus('Tidak ada data untuk diupload', false);
    return;
  }

  // Validasi: pastikan semua donatur sudah diinput
  if (!semuaDonaturTerinput(kategori)) {
    const totalDonatur = kategoriDonatur[kategori].length;
    const sudahDiinput = donaturTerinput[kategori].size;
    const sisa = totalDonatur - sudahDiinput;
    showUploadStatus(
      `Masih ada ${sisa} donatur yang belum diinput. Harap lengkapi semua data terlebih dahulu.`,
      false
    );
    return;
  }

  showUploadStatus('🔄 Mengupload data...', null);
  cachedElements.btnUpload.disabled = true;

  const uploadData = {
    kategori: kategori,
    data: getSortedDataDonasi(kategori),
    timestamp: new Date().getTime()
  };

  if (navigator.onLine) {
    // Online - attempt direct upload
    try {
      await attemptOnlineUpload(uploadData, kategori);
    } catch (error) {
      console.error('Online upload failed, saving for offline sync:', error);
      await saveForOfflineUpload(uploadData, kategori);
    }
  } else {
    // Offline - save to queue
    await saveForOfflineUpload(uploadData, kategori);
  }
}

async function attemptOnlineUpload(uploadData, kategori) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(uploadData),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const result = await response.json();
      await handleUploadSuccess(kategori, result.message);
    } else {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
  } catch (error) {
    throw error;
  }
}

async function saveForOfflineUpload(uploadData, kategori) {
  try {
    await db.addToUploadQueue({
      data: uploadData,
      kategori: kategori,
      tanggal: new Date().toLocaleDateString('id-ID'),
      timestamp: new Date().getTime(),
      attempts: 0
    });
    
    showUploadStatus(
      '💾 Data disimpan untuk upload otomatis ketika koneksi tersedia',
      true
    );
    
    // Mark as uploaded locally to prevent duplicates
    const today = new Date().toISOString().split('T')[0];
    let lastUploadDate = JSON.parse(localStorage.getItem('lastUploadDate') || '{}');
    lastUploadDate[kategori] = today;
    localStorage.setItem('lastUploadDate', JSON.stringify(lastUploadDate));
    
    sudahUploadHariIni[kategori] = true;
    updateUploadButtonState();
    
  } catch (error) {
    console.error('❌ Error saving to upload queue:', error);
    showUploadStatus('❌ Gagal menyimpan data untuk upload offline', false);
  } finally {
    cachedElements.btnUpload.disabled = false;
  }
}

async function handleUploadSuccess(kategori, message = '') {
  const today = new Date().toISOString().split('T')[0];
  let lastUploadDate = JSON.parse(localStorage.getItem('lastUploadDate') || '{}');
  lastUploadDate[kategori] = today;
  localStorage.setItem('lastUploadDate', JSON.stringify(lastUploadDate));

  sudahUploadHariIni[kategori] = true;
  checkUploadStatus();

  showUploadStatus(
    `✅ ${message || `Data berhasil diupload untuk kategori ${kategoriLabel[kategori]}`}`,
    true
  );

  // Reset data setelah upload berhasil
  dataDonasi = [];
  donaturTerinput[kategori] = new Set();
  const tbody = cachedElements.tabelDonasi.querySelector('tbody');
  tbody.innerHTML = '';
  updateTotalDisplay();
  updateDataCount();
  await muatDropdown(kategori);
  
  cachedElements.btnUpload.disabled = false;
}

async function hapusDataHariIni() {
  const kategori = cachedElements.kategoriDonatur.value;
  const today = new Date().toLocaleDateString('id-ID');
  
  if (dataDonasi.length === 0) {
    showNotification('Tidak ada data untuk dihapus', false);
    return;
  }
  
  if (!confirm(`Apakah Anda yakin ingin menghapus semua data hari ini untuk ${kategoriLabel[kategori]}?`)) {
    return;
  }

  try {
    // Delete from database
    const savedData = await db.getDailyInputs(kategori, today);
    for (const item of savedData) {
      await db.deleteDailyInput(item.id);
    }

    // Reset local state
    dataDonasi = [];
    donaturTerinput[kategori] = new Set();
    const tbody = cachedElements.tabelDonasi.querySelector('tbody');
    tbody.innerHTML = '';
    updateTotalDisplay();
    updateDataCount();
    await muatDropdown(kategori);
    
    showNotification('🗑️ Data hari ini berhasil dihapus', true);
  } catch (error) {
    console.error('❌ Error deleting data:', error);
    showNotification('Gagal menghapus data', false);
  }
}

// ======= HELPER FUNCTIONS =======
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function getLastUploadDate() {
  const raw = localStorage.getItem('lastUploadDate');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function semuaDonaturTerinput(kategori) {
  const totalDonatur = kategoriDonatur[kategori].length;
  const sudahDiinput = donaturTerinput[kategori].size;
  return totalDonatur === sudahDiinput;
}

function updateUploadButtonState() {
  const kategori = cachedElements.kategoriDonatur.value;
  const semuaSudahDiinput = semuaDonaturTerinput(kategori);
  const sudahUpload = sudahUploadHariIni[kategori];
  const adaData = dataDonasi.length > 0;

  const shouldEnable = (semuaSudahDiinput || adaData) && !sudahUpload && adaData;

  cachedElements.btnUpload.disabled = !shouldEnable;

  if (shouldEnable) {
    cachedElements.btnUpload.classList.remove('bg-gray-400', 'cursor-not-allowed');
    cachedElements.btnUpload.classList.add('bg-green-600', 'hover:bg-green-700', 'cursor-pointer');
  } else {
    cachedElements.btnUpload.classList.add('bg-gray-400', 'cursor-not-allowed');
    cachedElements.btnUpload.classList.remove('bg-green-600', 'hover:bg-green-700');
    
    if (sudahUpload) {
      cachedElements.uploadInfo.textContent = `Anda sudah melakukan upload hari ini untuk ${kategoriLabel[kategori]}. Upload hanya dapat dilakukan sekali per hari.`;
    } else if (!semuaSudahDiinput && adaData) {
      const totalDonatur = kategoriDonatur[kategori].length;
      const sudahDiinput = donaturTerinput[kategori].size;
      const sisa = totalDonatur - sudahDiinput;
      cachedElements.uploadInfo.textContent = `${sisa} donatur belum diinput. Upload akan aktif setelah semua donatur diinput.`;
    } else if (!adaData) {
      cachedElements.uploadInfo.textContent = `Tidak ada data untuk diupload.`;
    } else {
      cachedElements.uploadInfo.textContent = `Upload data input ke Google Sheets`;
    }
  }
}

function checkUploadStatus() {
  const lastUploadDate = getLastUploadDate();
  const today = new Date().toISOString().split('T')[0];
  const kategori = cachedElements.kategoriDonatur.value;

  if (lastUploadDate[kategori] === today) {
    sudahUploadHariIni[kategori] = true;
    showUploadStatus(
      `Anda sudah melakukan upload hari ini untuk ${kategoriLabel[kategori]}. Upload hanya dapat dilakukan sekali per hari.`,
      false
    );
  } else {
    sudahUploadHariIni[kategori] = false;
    showUploadStatus(
      `Siap untuk upload data kategori ${kategoriLabel[kategori]}`,
      null
    );
  }

  updateUploadButtonState();
}

function showNotification(message, isSuccess = true) {
  const notif = cachedElements.notifikasi;
  notif.textContent = message;
  notif.className = 'mb-4 md:mb-6 text-center p-3 md:p-4 rounded-xl transition-all duration-300 opacity-100 show';

  if (isSuccess) {
    notif.classList.add('bg-green-50', 'border-green-200', 'text-green-700');
  } else {
    notif.classList.add('bg-red-50', 'border-red-200', 'text-red-700');
  }

  setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => {
      notif.textContent = '';
      notif.className = 'mb-4 md:mb-6 text-center p-3 md:p-4 rounded-xl transition-all duration-300';
    }, 300);
  }, 4000);
}

function showUploadStatus(message, isSuccess = null) {
  const status = cachedElements.uploadStatus;
  status.textContent = message;
  status.className = 'text-center p-4 rounded-xl transition-all duration-300 opacity-100 show';

  if (isSuccess === true) {
    status.classList.add('bg-green-50', 'border-green-200', 'text-green-700');
  } else if (isSuccess === false) {
    status.classList.add('bg-red-50', 'border-red-200', 'text-red-700');
  } else {
    status.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-700');
  }
}

// LOGIKA DROPDOWN KEMBALI KE VERSI ORIGINAL
async function muatDropdown(kategori = 'kategori1') {
  const select = cachedElements.donatur;
  const names = kategoriDonatur[kategori];

  // Filter hanya donatur yang belum diinput
  const donaturBelumDiinput = names.filter(nama => !donaturTerinput[kategori].has(nama));

  // Kosongkan dropdown
  select.innerHTML = '';

  if (donaturBelumDiinput.length === 0) {
    // Semua donatur sudah diinput
    const option = new Option('🎉 Semua donatur sudah diinput', '');
    option.disabled = true;
    select.appendChild(option);

    cachedElements.btnTambah.disabled = true;
    cachedElements.btnTambah.querySelector('#btnText').textContent = 'Selesai';
    cachedElements.pemasukan.disabled = true;

    showNotification('✅ Semua donatur sudah diinput');
  } else {
    // Tambahkan donatur yang belum diinput
    const fragment = document.createDocumentFragment();

    // Add default option
    const defaultOption = new Option('Pilih Donatur', '');
    defaultOption.disabled = true;
    fragment.appendChild(defaultOption);

    donaturBelumDiinput.forEach(nama => {
      const option = new Option(nama, nama);
      fragment.appendChild(option);
    });

    select.appendChild(fragment);

    cachedElements.btnTambah.disabled = false;
    cachedElements.btnTambah.querySelector('#btnText').textContent = 'Tambah';
    cachedElements.pemasukan.disabled = false;

    // Tampilkan info berapa donatur tersisa
    const totalDonatur = names.length;
    const sudahDiinput = totalDonatur - donaturBelumDiinput.length;
    if (sudahDiinput > 0) {
      showNotification(`📝 ${sudahDiinput} donatur sudah diinput, ${donaturBelumDiinput.length} tersisa`);
    }
  }

  updateUploadButtonState();
}

function getSortedDataDonasi(kategori) {
  // Buat map untuk quick lookup
  const dataMap = new Map();
  dataDonasi.forEach(item => {
    dataMap.set(item.donatur, item);
  });

  // Urutkan berdasarkan urutan di kategoriDonatur
  const sortedData = [];
  kategoriDonatur[kategori].forEach(nama => {
    if (dataMap.has(nama)) {
      sortedData.push(dataMap.get(nama));
    }
  });

  return sortedData;
}

function renderTabelTerurut(kategori) {
  const tbody = cachedElements.tabelDonasi.querySelector('tbody');
  tbody.innerHTML = '';

  const sortedData = getSortedDataDonasi(kategori);

  if (sortedData.length === 0) {
    const row = tbody.insertRow();
    const cell = row.insertCell(0);
    cell.colSpan = 3;
    cell.className = 'py-8 text-center text-gray-500';
    cell.innerHTML = '<i class="fas fa-inbox text-4xl mb-2 block"></i><span>Tidak ada data untuk ditampilkan</span>';
    return;
  }

  sortedData.forEach(item => {
    const row = tbody.insertRow();
    row.className = 'hover:bg-gray-50 transition-colors';

    const donaturCell = row.insertCell(0);
    donaturCell.className = 'py-3 md:py-4 px-4 md:px-6';
    donaturCell.textContent = item.donatur;

    const nominalCell = row.insertCell(1);
    nominalCell.className = 'py-3 md:py-4 px-4 md:px-6 text-right font-mono';
    
    // Tampilkan berbeda untuk nominal 0
    if (parseInt(item.nominal) === 0) {
      nominalCell.textContent = 'Tidak Mengisi';
      nominalCell.classList.add('text-gray-400', 'italic');
    } else {
      nominalCell.textContent = 'Rp ' + Number(item.nominal).toLocaleString('id-ID');
      nominalCell.classList.remove('text-gray-400', 'italic');
    }

    const aksiCell = row.insertCell(2);
    aksiCell.className = 'py-3 md:py-4 px-4 md:px-6 text-center';

    const editBtn = document.createElement('button');
    editBtn.innerHTML = '<i class="fas fa-edit"></i>';
    editBtn.className = 'bg-amber-500 hover:bg-amber-600 text-white p-2 rounded-lg transition duration-200 mx-1';
    editBtn.title = 'Edit donasi';
    editBtn.addEventListener('click', () => editRow(row, kategori, item.donatur, item.id));
    aksiCell.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.className = 'bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg transition duration-200 mx-1';
    deleteBtn.title = 'Hapus donasi';
    deleteBtn.addEventListener('click', () => hapusRow(kategori, item.donatur, item.id));
    aksiCell.appendChild(deleteBtn);
  });
}

function updateTotalDisplay() {
  let total = 0;
  dataDonasi.forEach(item => {
    total += Number(item.nominal);
  });

  const formatted = 'Rp ' + total.toLocaleString('id-ID');
  cachedElements.totalDonasi.textContent = formatted;
}

function editRow(row, kategori, donaturLama, itemId) {
  const nominalCell = row.cells[1];
  const aksiCell = row.cells[2];
  const currentNominal = nominalCell.textContent.replace(/[Rp\s.]/g, '');

  nominalCell.innerHTML = `<input type="number" id="editInput" value="${currentNominal}" min="0" 
     class="w-24 md:w-32 px-3 py-2 border border-gray-300 rounded text-right font-mono 
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500">`;

  aksiCell.innerHTML = '';

  const saveBtn = document.createElement('button');
  saveBtn.innerHTML = '<i class="fas fa-check"></i>';
  saveBtn.className = 'bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-lg mx-1 transition duration-200';
  saveBtn.addEventListener('click', () => saveRow(row, kategori, donaturLama, itemId));
  aksiCell.appendChild(saveBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
  cancelBtn.className = 'bg-gray-500 hover:bg-gray-600 text-white p-2 rounded-lg mx-1 transition duration-200';
  cancelBtn.addEventListener('click', () => renderTabelTerurut(kategori));
  aksiCell.appendChild(cancelBtn);

  // Focus on input
  setTimeout(() => {
    const editInput = document.getElementById('editInput');
    if (editInput) {
      editInput.focus();
      editInput.select();
    }
  }, 100);
}

async function saveRow(row, kategori, donaturLama, itemId) {
  const newValue = document.getElementById('editInput').value;
  if (newValue === '') {
    showNotification('Nominal tidak boleh kosong', false);
    return;
  }

  try {
    // Update dataDonasi
    const index = dataDonasi.findIndex(item => item.donatur === donaturLama);
    if (index !== -1) {
      dataDonasi[index].nominal = newValue;
    }

    // Update in database
    if (itemId) {
      await db.updateDailyInput(itemId, { nominal: newValue });
    }

    // Render ulang tabel dengan urutan yang benar
    renderTabelTerurut(kategori);
    updateTotalDisplay();
    
    // Tampilkan notifikasi berbeda untuk nominal 0
    if (parseInt(newValue) === 0) {
      showNotification(`✅ Donasi ${donaturLama} diperbarui (tidak mengisi)`);
    } else {
      showNotification(`✅ Donasi ${donaturLama} berhasil diperbarui`);
    }
    
    updateUploadButtonState();
  } catch (error) {
    console.error('Error updating row:', error);
    showNotification('Gagal memperbarui data', false);
  }
}

async function hapusRow(kategori, donatur, itemId) {
  if (!confirm(`Hapus data untuk ${donatur}?`)) {
    return;
  }

  try {
    // Remove from dataDonasi
    dataDonasi = dataDonasi.filter(item => item.donatur !== donatur);
    
    // Remove from donaturTerinput
    donaturTerinput[kategori].delete(donatur);
    
    // Remove from database
    if (itemId) {
      await db.deleteDailyInput(itemId);
    }

    // Re-render
    renderTabelTerurut(kategori);
    updateTotalDisplay();
    updateDataCount();
    await muatDropdown(kategori);
    
    showNotification(`🗑️ Data ${donatur} berhasil dihapus`);
  } catch (error) {
    console.error('Error deleting row:', error);
    showNotification('Gagal menghapus data', false);
  }
}

// Export for global access
window.jimpitanApp = {
  syncOfflineData,
  checkOfflineData,
  getData: () => dataDonasi,
  getDatabase: () => db
};
