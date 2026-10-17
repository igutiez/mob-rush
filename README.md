# Mob Rush

Juego web 3D (PWA) inspirado en las mecánicas de los juegos de multitudes: dispara tu ejército, multiplícalo en las puertas y derriba el castillo enemigo.

- Código en `game/js/` como módulos ES (Three.js en local, sin paso de compilación): `engine` (render), `world` (mundos), `bases`, `models` (tropas y héroes animados por shader), `fx`, `ui`, `save` y `main`.
- Depuración desde la consola: `__mobrush.goto(n)`, `__mobrush.hero()`.
- Local: `npm run serve` y abre http://localhost:8080
- Se publica en GitHub Pages con cada push a `main`.
- Al cambiar archivos, sube `CACHE` en `game/sw.js` para que los móviles instalados se actualicen.

## Modelos 3D

Los personajes son de los packs **KayKit Adventurers** y **KayKit Skeletons** de [Kay Lousberg](https://www.kaylousberg.com) (licencia CC0), descargados de [KayKit-Game-Assets](https://github.com/KayKit-Game-Assets).

- Los originales van en `assets-src/kaykit/` (no se suben) y `npm run models` los recorta a `game/assets/`.
- La multitud usa poses precalculadas: cada pose de la animación es una malla instanciada y los personajes se agrupan por pose. No usa sombreadores especiales (la versión con texturas VAT bloqueaba la GPU de algunos móviles).
- Diagnóstico: `?debug` muestra errores y GPU en pantalla; `?nobloom` desactiva el brillo.
