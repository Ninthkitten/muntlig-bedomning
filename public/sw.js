// Minimal service worker – krävs för att Chrome ska erbjuda "Installera app".
// Ingen cachning: alla anrop går rakt till nätet (appen kräver ändå uppkoppling).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
self.addEventListener('fetch', () => {});
