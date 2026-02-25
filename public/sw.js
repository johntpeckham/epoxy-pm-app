// This service worker is auto-replaced by next-pwa during production builds.
// This file serves as a placeholder for development and initial setup.

const CACHE_NAME = 'peckham-coatings-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through — next-pwa will generate a full caching strategy in production
  event.respondWith(fetch(event.request));
});
