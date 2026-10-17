# Mob Rush

Juego web 3D (PWA) inspirado en las mecánicas de los juegos de multitudes: dispara tu ejército, multiplícalo en las puertas y derriba el castillo enemigo.

- Código en `game/js/` como módulos ES (Three.js en local, sin paso de compilación): `engine` (render), `world` (mundos), `bases`, `models` (tropas y héroes animados por shader), `fx`, `ui`, `save` y `main`.
- Depuración desde la consola: `__mobrush.goto(n)`, `__mobrush.hero()`.
- Local: `npm run serve` y abre http://localhost:8080
- Se publica en GitHub Pages con cada push a `main`.
- Al cambiar archivos, sube `CACHE` en `game/sw.js` para que los móviles instalados se actualicen.
