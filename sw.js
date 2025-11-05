const CACHE_NAME = "jimpitan-app-v1.3.0";
const STATIC_CACHE = "static-cache-v4";
const DYNAMIC_CACHE = "dynamic-cache-v1";

const GITHUB_PAGES_URL = "https://santri-programmer.github.io/baru/";

// Assets yang akan di-cache
const STATIC_ASSETS = [
  `${GITHUB_PAGES_URL}`,
  `${GITHUB_PAGES_URL}index.html`,
  `${GITHUB_PAGES_URL}style.css`,
  `${GITHUB_PAGES_URL}script.js`,
  `${GITHUB_PAGES_URL}db.js`,
  `${GITHUB_PAGES_URL}sw.js`,
  `${GITHUB_PAGES_URL}manifest.json`,
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
  "https://cdn.tailwindcss.com",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...");

  // Skip waiting untuk aktivasi langsung
  self.skipWaiting();

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("Caching static assets");
        // Gunakan cache.addAll() dengan error handling
        return Promise.allSettled(
          STATIC_ASSETS.map((url) =>
            cache
              .add(url)
              .catch((err) => console.warn(`Failed to cache ${url}:`, err))
          )
        );
      })
      .then(() => console.log("Static assets cached"))
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activated");

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            // Hapus cache lama
            if (cache !== STATIC_CACHE && cache !== DYNAMIC_CACHE) {
              console.log("Deleting old cache:", cache);
              return caches.delete(cache);
            }
          })
        );
      })
      .then(() => {
        console.log("Cache cleanup completed");
        // Klaim clients langsung
        return self.clients.claim();
      })
  );
});

// Fetch event dengan strategi cache-first untuk static, network-first untuk dynamic
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip chrome-extension dan external APIs kecuali CDN yang kita gunakan
  if (url.protocol === "chrome-extension:") return;

  // Tentukan strategi caching berdasarkan jenis request
  const isStaticAsset =
    STATIC_ASSETS.includes(event.request.url) ||
    url.hostname === "cdnjs.cloudflare.com" ||
    url.hostname === "cdn.tailwindcss.com";

  const isOurDomain = url.hostname === "santri-programmer.github.io";

  if (!isOurDomain && !isStaticAsset) return;

  event.respondWith(
    (async () => {
      try {
        // Untuk static assets, gunakan cache-first strategy
        if (isStaticAsset) {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            // Background update cache
            event.waitUntil(updateCache(event.request));
            return cachedResponse;
          }

          // Jika tidak ada di cache, fetch dan cache
          const response = await fetch(event.request);
          if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(event.request, response.clone());
          }
          return response;
        }

        // Untuk dynamic content, gunakan network-first strategy
        try {
          const response = await fetch(event.request);
          // Cache response yang successful
          if (response.ok && isOurDomain) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(event.request, response.clone());
          }
          return response;
        } catch (error) {
          // Fallback ke cache jika network gagal
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }

          // Fallback untuk halaman
          if (event.request.destination === "document") {
            return caches.match(`${GITHUB_PAGES_URL}index.html`);
          }

          throw error;
        }
      } catch (error) {
        console.log("Fetch failed:", error);
        // Final fallback
        if (event.request.destination === "document") {
          return caches.match(`${GITHUB_PAGES_URL}index.html`);
        }
        return new Response("Network error happened", {
          status: 408,
          headers: { "Content-Type": "text/plain" },
        });
      }
    })()
  );
});

// Helper function untuk update cache di background
async function updateCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response);
    }
  } catch (error) {
    // Silent fail untuk background update
    console.log("Background cache update failed:", error);
  }
}

// Background sync untuk data offline
self.addEventListener("sync", (event) => {
  if (event.tag === "background-sync") {
    console.log("Background sync triggered");
    event.waitUntil(syncOfflineData());
  }
});

// Periodic sync untuk cleanup dan maintenance
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "cleanup-sync") {
    console.log("Periodic cleanup sync");
    event.waitUntil(performCleanup());
  }
});

async function syncOfflineData() {
  // Implementasi sync offline data
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({
      type: "SYNC_OFFLINE_DATA",
    });
  });
}

async function performCleanup() {
  // Cleanup cache dan data lama
  console.log("Performing periodic cleanup");
}
