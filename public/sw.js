// Seatora's service worker: only what browsers need to offer "Install". It caches nothing and passes every request to
// the network, so signed-in pages and names are never stored on the device.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
