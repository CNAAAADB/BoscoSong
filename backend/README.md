# BoscoSong AWS · Estado de producción piloto

**Desplegado en eu-west-1:** pila CloudFormation `BoscoSongPilot`, Cognito, Lambda, API Gateway HTTP y tabla DynamoDB PAY_PER_REQUEST. El frontend de GitHub Pages ya utiliza la API real mediante `public/config.json`.

- **Plantilla autoritativa del despliegue real:** `backend/deployed-stack.json`.
- **Importante:** el archivo `backend/template.yaml` es un borrador SAM anterior; no lo ejecutes sobre la pila `BoscoSongPilot`, ya que la sustituirías por una topología diferente.
- **Inicio de sesión:** Cognito permite únicamente usuarios creados/invitados por un administrador. La pertenencia al grupo `editors` permite publicar, editar o borrar canciones. Actualmente no se ha invitado ninguna cuenta.
- **Límites de coste:** API HTTP limitada a 6 solicitudes por segundo y ráfagas de 12. Lambda 128 MB y DynamoDB bajo demanda, sin instancias permanentes. Vigilar uso y presupuestos de AWS.
- **Comprobaciones realizadas:** GET /changes => 200; invocación sin grupo de edición => 403; escritura y lectura temporales => 200 y limpieza posterior.
- **Ámbito actual:** canciones públicas y cambios compartidos; las sesiones siguen siendo locales o compartidas por enlace completo, no hay todavía un índice global de sesiones.

## Invitación del primer editor

Desde la consola AWS en **Cognito → User pools → BoscoSong-Editors-Pilot**, crea/invita al usuario con su correo real y añádelo al grupo `editors`. No introduzcas contraseñas ni secretos en GitHub ni en el chat. La primera entrada utiliza la interfaz de Cognito y el cambio de contraseña inicial.

## Mantenimiento

Los cambios de infraestructura deben hacerse actualizando `backend/deployed-stack.json` y la pila CloudFormation correspondiente. No edites los recursos por separado, para evitar discrepancias con la plantilla declarativa.

---

# Referencia histórica del planteamiento AWS SAM

The static GitHub Pages site is publicly readable. The existing 1,419-song catalog is distributed as `public/catalog/*.json`. Only **approved Cognito editors** can publish, edit or delete songs, and every change is checked server-side.

## Infrastructure

- Cognito User Pool: no public self-registration, hosted sign-in with Authorization Code + PKCE; editor accounts are invited by the administrator.
- API Gateway HTTP API: GET `/changes` is public; PUT `/songs/{id}`, DELETE `/songs/{id}`, and POST `/songs/batch` require a valid JWT.
- Lambda: additionally verifies membership in Cognito group `editors`.
- DynamoDB on-demand: holds edited/new songs and deletion markers, while the bulk initial catalog stays in static JSON. This avoids storing the same 2.9 MB repeatedly and keeps test costs low.
- No access keys or secret credentials are embedded in the frontend.

**The AWS resources do not exist until you deploy this template.** The GitHub frontend can already read the static catalog, but publishing controls remain disabled until the API is configured.

## Deploy from a limited-permission AWS identity

Use an IAM deployment role with the minimum necessary permissions for CloudFormation, Lambda, API Gateway, Cognito, DynamoDB, IAM (service role creation) and S3 (SAM artifact upload). Do not deploy from the AWS root identity.

Install AWS CLI and SAM CLI locally. In `backend/` run:

```bash
sam build --template-file template.yaml
sam deploy --guided --stack-name BoscoSongPilot --region eu-west-1 --capabilities CAPABILITY_IAM
```

Save the stack outputs `ApiBase`, `CognitoDomain`, `ClientId`, and `UserPoolId`. Configure **only public identifiers** in `public/config.json`:

```json
{
  "apiBase": "https://YOUR_API_ID.execute-api.eu-west-1.amazonaws.com",
  "cognitoDomain": "YOUR_DOMAIN.auth.eu-west-1.amazoncognito.com",
  "clientId": "YOUR_USER_POOL_CLIENT_ID"
}
```

Commit this file to GitHub. Github Pages will rebuild and show **Iniciar sesión**.

Do not store passwords, IAM access keys, client secrets or refresh tokens in GitHub. The PKCE login uses a public Cognito App Client without a secret.

## Invite editors (no open registration)

From a properly authorized AWS identity:

```bash
aws cognito-idp admin-create-user --region eu-west-1 \
  --user-pool-id YOUR_USER_POOL_ID \
  --username editor@example.org \
  --user-attributes Name=email,Value=editor@example.org Name=email_verified,Value=true

aws cognito-idp admin-add-user-to-group --region eu-west-1 \
  --user-pool-id YOUR_USER_POOL_ID \
  --username editor@example.org \
  --group-name editors
```

Cognito sends an invitation / temporary password according to its configured email delivery. The editor must complete the password change when first signing in.

**Do not create self-registration or make the editor group public**. Reading the catalog is open, but every mutation checks both the JWT and Cognito group membership on the server.

## How data is shared

1. Page load: fetch the 1,419-song baseline from static JSON on GitHub Pages.
2. If AWS is configured, fetch GET `/changes` and overlay edits and deletion markers.
3. Editing or uploading songs: protected API writes to DynamoDB and responds only after success.
4. Deleting a baseline song: API records a deletion marker. Public readers no longer see it even though its historical version remains in source control.

The public catalog contains lyrics. Confirm appropriate permissions before sharing it publicly.

## Costs and security

The pilot uses only serverless resources with usage-based charges. Set an AWS Budget / cost alert, keep requests and public exposure controlled, monitor Lambda CloudWatch metrics, and disable the stack when testing ends. **On-demand does not mean free.**

The permissions and UI are implemented in source, but deployment and editor invitations must be carried out with a scoped AWS identity before users can authenticate and publish.
