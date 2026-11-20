# BoscoSong

Prototipo web (React + Vite) del cancionero del coro, preparado para GitHub Pages. No requiere AWS, base de datos remota, roles ni cuentas.

## Prueba con el cancionero CJAtocha 2024

1. Descarga el JSON indexado generado a partir del PDF de 432 páginas.
2. Abre la web de prueba de BoscoSong.
3. En **Canciones**, pulsa **Importar cancionero JSON** y selecciona el archivo descargado.
4. Filtra por sección (por ejemplo, **Cantos de entrada** o **Cantos de comunión**) y busca por título o fragmento de letra.
5. Abre una canción, activa o desactiva **Acordes**, utiliza **-** o **+** para transportar por semitonos y revisa el resultado visual.
6. Pulsa **Editar** y luego en cualquier carácter para colocar un acorde. Pulsa sobre un acorde existente para modificarlo o quitarlo.
7. La canción y sus cambios se guardan en **IndexedDB del navegador**. No hay sincronización entre dispositivos.

## Revisión de la importación

Las líneas y los acordes se estimaron mediante las coordenadas tipográficas del PDF original, teniendo en cuenta el diseño en dos columnas. **No se ha revisado musicalmente cada canción**, por lo que los anclajes, las transposiciones especiales, el texto y los títulos deben verificarse frente al PDF antes de interpretarlos en una celebración.

La etiqueta `tags` guarda el nombre original de la sección del documento; `sourcePages` identifica las páginas PDF de referencia. El campo `reviewStatus` distingue `pendiente` (texto extraído sin revisar) y `sin contenido` (referencia detectada solo en el índice).

Las grafías españolas mantienen la distinción mayúscula/menor: `LA` (La mayor) y `la` (La menor). `+7` aislado no permite inferir por sí solo la raíz del acorde y requiere revisión.

### Alcance actual

- Visualización de letras y acordes, búsqueda y filtro por sección.
- Guía básica de notas armónicas al piano (no es una partitura ni una digitación fija).
- Transporte cromático en semitonos.
- Sesiones locales ordenadas y duplicables.
- Autoscroll aproximado controlado con BPM y velocidad: **no sigue un mapa temporal por sílabas**.
- Importación individual de PDF con texto, imágenes y TXT en el editor.
- Importación masiva del cancionero mediante JSON, conservado localmente.

No hay todavía sesiones multiusuario, sincronización, reconocimiento musical de partituras ni transporte de pentagramas.

## Desarrollo local

```bash
npm install
npm run dev
```

## GitHub Pages

El proyecto está configurado con la ruta Vite `/BoscoSong/` y un workflow `.github/workflows/pages.yml`. En **Settings > Pages > Build and deployment**, seleccionar **GitHub Actions** como Source para evitar que un despliegue Jekyll del origen de rama reemplace el construido con React.

URL prevista: https://cnaaaadb.github.io/BoscoSong/

## Datos y privacidad

El PDF del cancionero **no se incluye en este repositorio**. La importación desde JSON se hace en el navegador, de modo que las canciones no se publican automáticamente en GitHub Pages. Antes de compartir públicamente el material, revisar derechos de reproducción y distribución. Evitar borrar los datos del navegador sin exportar una copia.
