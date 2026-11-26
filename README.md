# BoscoSong

Cancionero colaborativo para coros y músicos. **React + Vite + GitHub Pages** para la interfaz; **Cognito + API Gateway + Lambda + DynamoDB** para cuentas y modificaciones compartidas. Se mantiene la tipografía **Montserrat** y la paleta `#252b57`, `#d0a73f` y `#e6d7aa`.

## Consultar canciones

La biblioteca inicial de 1.419 canciones se descarga automáticamente de los JSON estáticos en `public/catalog/`. Cualquiera puede buscar por letra, título o sección y visualizar las letras, acordes y guía de piano, transportarlos por semitonos, cambiar el tamaño de letra o usar la pantalla completa y el desplazamiento automático.

## Cuentas y permisos

- **Crear cuenta**: desde la web, Cognito permite registrarse con correo y confirmarlo mediante email.
- **Entrar**: acceso con Cognito Authorization Code + PKCE, sin credenciales AWS ni contraseñas almacenadas en el frontend.
- **Nombre de usuario único**: tras iniciar sesión por primera vez, cada persona debe reservar un identificador `@usuario` (3–24 caracteres, letras —incluidas ñ y tildes—, números y guion bajo). No distingue mayúsculas y minúsculas; AWS impide los duplicados mediante una transacción de DynamoDB. El nombre se fija para mantener estables las etiquetas de autor. No se pueden publicar canciones ni crear/modificar sesiones hasta elegirlo. El servidor añade automáticamente `@usuario` a las canciones y sesiones nuevas; no se admiten etiquetas de autor falsificadas.
- **Canciones nuevas**: cada cuenta puede subir imágenes, PDF, TXT o JSON y guardar canciones. El propietario queda identificado con el `sub` del token Cognito. Solo ese usuario (o un administrador) puede editarlas o eliminarlas; Lambda valida el permiso.
- **Cantos históricos del cancionero**: siguen sin un usuario propietario; solo el grupo `editors` puede modificarlos. Las canciones publicadas por miembros particulares solo permiten edición de su autor y administradores.

## Sesiones compartidas

- Todas las sesiones se consultan desde DynamoDB; se buscan por título, creador o código `BS-...`. Se comparte un enlace con el código.
- Solo una persona autenticada puede crear sesiones. Solo el propietario puede editar su nombre, orden y contenido musical.
- Cada canción de la sesión almacena sus ajustes de transporte (en semitonos), velocidad de desplazamiento y BPM.
- Al abrir una canción desde una sesión se recuperan esos ajustes. El visor es el mismo que el cancionero habitual y permite ir a la canción anterior/siguiente sin salir de la sesión.
- Si el dueño cambia tono, velocidad o BPM dentro del visor, los cambios se guardan con una pequeña espera para evitar llamadas excesivas; otros visitantes pueden practicar con ajustes locales pero **no modificar la sesión persistida**.
- Las sesiones históricas exclusivamente locales no se han publicado automáticamente en AWS. Si tienes un JSON de una sesión anterior, conserva una copia antes de limpiar los datos del navegador.

## Tecnología y persistencia

- GitHub Pages distribuye la interfaz y el cancionero base. DynamoDB guarda canciones añadidas o editadas, marcas de borrado, perfiles de usuario y sesiones.
- Los cambios se consultan por API y se superponen al cancionero estático. IndexedDB sigue siendo una caché en cada navegador, no el origen de la verdad.
- Cognito y API Gateway comprueban JWT; Lambda verifica el propietario mediante la identidad del token y expresiones condicionales de DynamoDB.
- Infraestructura declarativa real: `backend/deployed-stack.json` (stack `BoscoSongPilot` en `eu-west-1`). Código fuente Lambda: `backend/api/app.py`.
- Consulta pública, pero las escrituras requieren iniciar sesión. Las cargas deben corresponder a material que tengas permiso para compartir.

## OCR y exactitud musical

El importador intenta distinguir acordes de letra con cajas tipográficas y coordenadas OCR. La posición acorde-sílaba se guarda por índice de carácter y el visor adapta las líneas a móvil sin separarlos deliberadamente. La detección debe revisarse frente a la fuente original; todavía no hay reconocimiento ni transposición de partituras musicales.

## Desarrollo

```bash
npm install
npm test
npm run dev
```

La publicación de GitHub Pages se ejecuta en `.github/workflows/pages.yml`. URL: https://cnaaaadb.github.io/BoscoSong/

### Seguridad y costes

Cognito solo almacena credenciales dentro de AWS. No colocar contraseñas, secretos ni claves IAM en GitHub. El stack es serverless y se ha limitado la tasa de API a 6 solicitudes/s, pero AWS puede cobrar por el uso, y el registro público necesita vigilancia contra abuso. Los datos de canciones y sesiones creados por usuarios se publican a todos los visitantes por decisión de diseño de este prototipo.
