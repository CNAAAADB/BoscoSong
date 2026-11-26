# BoscoSong · Backend compartido en AWS

**Pila desplegada:** `BoscoSongPilot` en `eu-west-1`.

El sitio web público se aloja en GitHub Pages; utiliza Cognito para registro e inicio de sesión (correo verificado), API Gateway HTTP para llamadas autenticadas, Lambda Python para autorización y DynamoDB bajo demanda para persistencia.

## Cuentas y permisos

- Los usuarios pueden registrarse y confirmar su correo desde Cognito.
- El inicio de sesión usa Authorization Code + PKCE y tokens de acceso de corta duración; no se guardan contraseñas en GitHub.
- Cada usuario elige un nombre visible que queda almacenado en una fila `USER#sub`.
- Nuevas canciones (`usr-...`) y sesiones (`BS-...`) llevan `ownerSub` de un token Cognito validado y `ownerName` para visualización. Los nombres y etiquetas de autor los fija Lambda, no el cliente.
- Las canciones y sesiones solo pueden modificarse por su propietario; el grupo `editors` conserva permisos administrativos de canciones del catálogo histórico y moderación.
- Los demás visitantes pueden consultar canciones y sesiones. Los ajustes personales de un visitante no modifican los valores compartidos por el creador.

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/changes` | Público |
| GET | `/sessions` | Público |
| GET | `/sessions/{id}` | Público |
| GET / PUT | `/profile` | Usuario autenticado |
| PUT / DELETE | `/songs/{id}` | Propietario o administrador |
| POST | `/songs/batch` | Usuario autenticado; IDs nuevos |
| POST | `/sessions` | Usuario autenticado |
| PUT | `/sessions/{id}` | Propietario de la sesión |

El transporte y la velocidad se guardan por canción en cada sesión. La API revisa los rangos y utiliza condiciones de DynamoDB para evitar sobrescrituras de otros usuarios.

## Infraestructura y mantenimiento

- **Definición declarativa real:** `backend/deployed-stack.json`.
- **Fuente Lambda:** `backend/api/app.py`.
- `backend/template.yaml` es un borrador SAM histórico, **no utilizarlo para actualizar esta pila**.
- DynamoDB usa facturación PAY_PER_REQUEST y API Gateway está limitada a 6 solicitudes por segundo, ráfagas de 12.
- La cuenta AWS puede generar costes; supervisar consumo, invocaciones y uso de Cognito.
- El catálogo inicial de 1.419 canciones estático continúa en GitHub Pages; los cambios y canciones añadidas se almacenan en DynamoDB.
- Las sesiones creadas en versiones antiguas y almacenadas únicamente en un navegador no se publican automáticamente; conservar su JSON para migración.

## Comprobación de autorización

Pruebas realizadas contra Lambda y DynamoDB con registros temporales:

- Creador: guardar canción y sesión = autorizado.
- Otro usuario: editar/borrar canción ajena = 403.
- Otro usuario: editar sesión ajena = 403.
- Consulta pública de sesión = permitida.
- Etiqueta de autor = nombre del perfil guardado, ignorando etiquetas `@...` falsas.
- Los registros de prueba se eliminaron después.

La identidad de Cognito es verificada antes de llegar a las rutas protegidas de Lambda por el autorizador JWT de API Gateway. Las pruebas directas de Lambda validan además la lógica de permisos del backend.
