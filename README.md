# BoscoSong

Prototipo de cancionero para coros y músicos.

**Estado:** desarrollo inicial. Web estática con React + Vite, desplegada mediante GitHub Pages. Sin usuarios ni backend; las canciones se almacenan solo en el navegador durante las pruebas.

## Objetivo prioritario

Importar PDFs e imágenes y conservar la posición del acorde en la letra. La detección automática requiere revisión humana, especialmente con escaneos, fuentes proporcionales y sílabas complejas.

## Ejecución

```bash
npm install
npm run dev
```

## Despliegue

En GitHub: Settings > Pages > Build and deployment > Source: **GitHub Actions**. Cada push a `main` ejecuta `.github/workflows/pages.yml`.

## Limitaciones deliberadas del prototipo

- No hay cuentas ni sesiones compartidas entre dispositivos.
- Los datos se guardan en localStorage, sin sincronización ni copias de seguridad.
- La importación puede requerir corregir manualmente las posiciones de los acordes.
- El desplazamiento sigue una velocidad aproximada ligada al BPM; el documento de origen no contiene tiempos reales por sílaba.
- Las partituras rasterizadas no pueden transportarse de forma fiable sin reconstruir la notación. No se promete esa función en esta versión.

No publicar material protegido por derechos de autor sin autorización.
