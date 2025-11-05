// IndexedDB utility for offline data storage
class JimpitanDB {
  constructor() {
    this.dbName = "JimpitanAppDB";
    this.version = 1;
    this.db = null;
    this._initPromise = null; // Cache initialization promise
  }

  // Initialize database dengan caching promise
  async init() {
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = new Promise((resolve, reject) => {
      // Periksa apakah IndexedDB tersedia
      if (!window.indexedDB) {
        reject(new Error("IndexedDB tidak didukung oleh browser ini"));
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        this._initPromise = null;
        reject(new Error("Failed to open database"));
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;

        // Optimasi: Handle database closure
        this.db.onversionchange = () => {
          this.db.close();
          this._initPromise = null;
          console.log("Database version changed, reopening...");
        };

        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object store for daily inputs
        if (!db.objectStoreNames.contains("dailyInputs")) {
          const store = db.createObjectStore("dailyInputs", {
            keyPath: "id",
            autoIncrement: true,
          });

          // Create indexes for querying
          store.createIndex("kategori", "kategori", { unique: false });
          store.createIndex("tanggal", "tanggal", { unique: false });
          store.createIndex("donatur", "donatur", { unique: false });
          store.createIndex("synced", "synced", { unique: false });
        }

        // Create object store for upload queue
        if (!db.objectStoreNames.contains("uploadQueue")) {
          const queueStore = db.createObjectStore("uploadQueue", {
            keyPath: "id",
            autoIncrement: true,
          });
          queueStore.createIndex("timestamp", "timestamp", { unique: false });
          queueStore.createIndex("attempts", "attempts", { unique: false });
        }

        // Create object store for app settings
        if (!db.objectStoreNames.contains("settings")) {
          const settingsStore = db.createObjectStore("settings", {
            keyPath: "key",
          });
        }
      };

      request.onblocked = () => {
        console.warn("Database upgrade blocked, closing connections...");
      };
    });

    return this._initPromise;
  }

  // Save daily input data
  async saveDailyInput(inputData) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["dailyInputs"], "readwrite");
      const store = transaction.objectStore("dailyInputs");

      // Add timestamp
      const dataWithMeta = {
        ...inputData,
        createdAt: new Date().toISOString(),
        synced: false,
      };

      const request = store.add(dataWithMeta);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error("Failed to save data"));
      };
    });
  }

  // Get daily inputs by kategori and date
  async getDailyInputs(kategori, tanggal = null) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["dailyInputs"], "readonly");
      const store = transaction.objectStore("dailyInputs");
      const index = store.index("kategori");

      const request = index.getAll(kategori);

      request.onsuccess = () => {
        let results = request.result;

        // Filter by date if provided
        if (tanggal) {
          results = results.filter((item) => item.tanggal === tanggal);
        }

        resolve(results);
      };

      request.onerror = () => {
        reject(new Error("Failed to retrieve data"));
      };
    });
  }

  // Update daily input
  async updateDailyInput(id, updates) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["dailyInputs"], "readwrite");
      const store = transaction.objectStore("dailyInputs");

      // First get the existing data
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const existingData = getRequest.result;
        if (!existingData) {
          reject(new Error("Data not found"));
          return;
        }

        // Merge updates
        const updatedData = {
          ...existingData,
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Save updated data
        const putRequest = store.put(updatedData);

        putRequest.onsuccess = () => {
          resolve(updatedData);
        };

        putRequest.onerror = () => {
          reject(new Error("Failed to update data"));
        };
      };

      getRequest.onerror = () => {
        reject(new Error("Failed to retrieve data for update"));
      };
    });
  }

  // Delete daily input
  async deleteDailyInput(id) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["dailyInputs"], "readwrite");
      const store = transaction.objectStore("dailyInputs");

      const request = store.delete(id);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(new Error("Failed to delete data"));
      };
    });
  }

  // Add to upload queue
  async addToUploadQueue(data) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["uploadQueue"], "readwrite");
      const store = transaction.objectStore("uploadQueue");

      const queueItem = {
        ...data,
        timestamp: new Date().getTime(),
        attempts: 0,
      };

      const request = store.add(queueItem);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error("Failed to add to upload queue"));
      };
    });
  }

  // Get upload queue
  async getUploadQueue() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["uploadQueue"], "readonly");
      const store = transaction.objectStore("uploadQueue");

      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error("Failed to get upload queue"));
      };
    });
  }

  // Remove from upload queue
  async removeFromUploadQueue(id) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["uploadQueue"], "readwrite");
      const store = transaction.objectStore("uploadQueue");

      const request = store.delete(id);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(new Error("Failed to remove from upload queue"));
      };
    });
  }

  // Update upload queue attempts
  async updateUploadQueueAttempts(id, attempts) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["uploadQueue"], "readwrite");
      const store = transaction.objectStore("uploadQueue");

      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.attempts = attempts;
          const putRequest = store.put(item);
          putRequest.onsuccess = () => resolve(true);
          putRequest.onerror = () =>
            reject(new Error("Failed to update attempts"));
        } else {
          reject(new Error("Queue item not found"));
        }
      };
      getRequest.onerror = () => reject(new Error("Failed to get queue item"));
    });
  }

  // Save setting
  async saveSetting(key, value) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["settings"], "readwrite");
      const store = transaction.objectStore("settings");

      const request = store.put({ key, value });

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(new Error("Failed to save setting"));
      };
    });
  }

  // Get setting
  async getSetting(key) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["settings"], "readonly");
      const store = transaction.objectStore("settings");

      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };

      request.onerror = () => {
        reject(new Error("Failed to get setting"));
      };
    });
  }

  // Optimasi: Clean up old data (older than 30 days)
  async cleanupOldData(daysOld = 30) {
    if (!this.db) await this.init();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffISO = cutoffDate.toISOString();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(
        ["dailyInputs", "uploadQueue"],
        "readwrite"
      );
      const dailyStore = transaction.objectStore("dailyInputs");
      const queueStore = transaction.objectStore("uploadQueue");

      let deletedCount = 0;

      // Clean dailyInputs yang sudah disinkronkan dan lebih lama dari cutoff
      const dailyRequest = dailyStore.openCursor();
      dailyRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.createdAt < cutoffISO && cursor.value.synced) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        }
      };

      // Clean uploadQueue yang lebih lama dari 7 days
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const queueRequest = queueStore
        .index("timestamp")
        .openCursor(IDBKeyRange.upperBound(weekAgo.getTime()));
      queueRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        console.log(`Cleaned up ${deletedCount} old records`);
        resolve(deletedCount);
      };

      transaction.onerror = () => {
        reject(new Error("Failed to cleanup old data"));
      };
    });
  }
}

// Create global instance
const jimpitanDB = new JimpitanDB();
