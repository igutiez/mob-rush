// Sube CACHE al publicar cambios para que los clientes descarguen la nueva versión.
const CACHE = 'mobrush-v13';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/main.js',
  './js/engine.js',
  './js/world.js',
  './js/bases.js',
  './js/models.js',
  './js/fx.js',
  './js/ui.js',
  './js/save.js',
  './js/audio.js',
  './js/characters.js',
  './assets/CREDITS.txt',
  './assets/Barbarian.glb',
  './assets/Knight.glb',
  './assets/Mage.glb',
  './assets/Rogue.glb',
  './assets/Rogue_Hooded.glb',
  './assets/Skeleton_Minion.glb',
  './assets/Skeleton_Rogue.glb',
  './assets/Skeleton_Warrior.glb',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './vendor/three/three.module.js',
  './vendor/three/addons/environments/RoomEnvironment.js',
  './vendor/three/addons/geometries/RoundedBoxGeometry.js',
  './vendor/three/addons/postprocessing/EffectComposer.js',
  './vendor/three/addons/postprocessing/MaskPass.js',
  './vendor/three/addons/postprocessing/OutputPass.js',
  './vendor/three/addons/postprocessing/Pass.js',
  './vendor/three/addons/postprocessing/RenderPass.js',
  './vendor/three/addons/postprocessing/ShaderPass.js',
  './vendor/three/addons/postprocessing/UnrealBloomPass.js',
  './vendor/three/addons/shaders/CopyShader.js',
  './vendor/three/addons/shaders/LuminosityHighPassShader.js',
  './vendor/three/addons/shaders/OutputShader.js',
  './vendor/three/addons/utils/BufferGeometryUtils.js',
  './vendor/three/addons/utils/SkeletonUtils.js',
  './vendor/three/addons/loaders/GLTFLoader.js',
];

// Al instalar se ignora la caché HTTP (GitHub Pages cachea 10 minutos) para no mezclar versiones.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Código y páginas: primero la red (siempre la versión publicada), la caché solo sin conexión.
// Modelos, iconos y librerías: primero la caché.
const isCode = (url) => url.pathname.endsWith('/') || /\.(html|js|css|webmanifest)$/.test(url.pathname) && !url.pathname.includes('/vendor/');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (isCode(url)) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
    );
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
