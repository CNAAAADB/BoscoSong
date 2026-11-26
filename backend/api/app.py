"""BoscoSong: public songs/sessions and JWT-verified, owner-only mutations.

The original catalog lives in GitHub Pages; DynamoDB stores uploaded songs,
edits/tombstones, user display names, and saved sessions. The author identity
always comes from verified Cognito JWT claims, never client-supplied owner fields.
"""
import base64
import json
import os
import re
import secrets
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
SONG_ID = re.compile(r"^[A-Za-z0-9._:-]{1,160}$")
SESSION_ID = re.compile(r"^BS-[A-F0-9]{12}$")
DISPLAY_NAME = re.compile(r"^[\wÀ-ÿ .'-]{2,40}$", re.UNICODE)
MIN_SPEED, MAX_SPEED = 0.02, 5.0


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def send(status, body):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json; charset=utf-8",
                    "cache-control": "no-store"},
        "body": json.dumps(body, ensure_ascii=False, default=lambda x: float(x) if isinstance(x, Decimal) else str(x)),
    }


def event_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    if len(raw.encode("utf-8")) > 5_000_000:
        raise ValueError("Archivo demasiado grande")
    obj = json.loads(raw)
    if not isinstance(obj, dict):
        raise ValueError("El cuerpo debe ser un objeto JSON")
    return obj


def user_claims(event):
    claims = (event.get("requestContext", {})
              .get("authorizer", {}).get("jwt", {}).get("claims", {}))
    uid = claims.get("sub")
    if not isinstance(uid, str) or not uid or len(uid) > 160:
        raise PermissionError("Inicia sesión para continuar")
    groups = claims.get("cognito:groups", [])
    if isinstance(groups, str):
        try:
            decoded = json.loads(groups)
            groups = decoded if isinstance(decoded, list) else [str(decoded)]
        except ValueError:
            groups = [g.strip(" []'\"") for g in groups.split(",")]
    return uid, "editors" in groups, claims


def profile_name(uid, claims):
    row = table.get_item(Key={"id": "USER#" + uid}).get("Item")
    if row and row.get("name"):
        return row["name"]
    raw = claims.get("username") or claims.get("preferred_username") or ("Usuario " + uid[:8])
    return str(raw).split("@", 1)[0][:40].strip() or ("Usuario " + uid[:8])


def clean_name(name):
    name = str(name or "").strip()
    if not DISPLAY_NAME.fullmatch(name):
        raise ValueError("El nombre debe tener de 2 a 40 caracteres; usa letras, números, espacios o guiones")
    return name


def profile_response(uid, claims):
    return {"userId": uid, "displayName": profile_name(uid, claims)}


def parse_song(data, identifier, owner_id, owner_name):
    if not SONG_ID.fullmatch(identifier):
        raise ValueError("ID de canción inválido")
    title = str(data.get("title", "")).strip()
    if not title or len(title) > 180:
        raise ValueError("Título obligatorio de hasta 180 caracteres")
    raw_lines = data.get("lines", [])
    if not isinstance(raw_lines, list) or len(raw_lines) > 500:
        raise ValueError("Se admiten hasta 500 líneas")
    lines = []
    for line in raw_lines:
        if not isinstance(line, dict):
            raise ValueError("Línea inválida")
        lyrics = str(line.get("text", ""))
        if len(lyrics) > 2000:
            raise ValueError("Línea demasiado larga")
        chords = line.get("chords", [])
        if not isinstance(chords, list) or len(chords) > 40:
            raise ValueError("Demasiados acordes en una línea")
        valid = []
        for chord in chords:
            if not isinstance(chord, dict) or type(chord.get("index")) is not int:
                raise ValueError("Posición de acorde inválida")
            index, symbol = chord["index"], str(chord.get("symbol", "")).strip()
            if not 0 <= index <= len(lyrics) or not 0 < len(symbol) <= 40:
                raise ValueError("Posición o símbolo de acorde inválido")
            valid.append({"index": index, "symbol": symbol})
        lines.append({"text": lyrics, "chords": valid})
    tags = data.get("tags", [])
    if not isinstance(tags, list) or len(tags) > 20:
        raise ValueError("Demasiadas etiquetas")
    # Author tags are reserved; the API sets them from the verified identity.
    normal_tags = [str(t).strip()[:60] for t in tags if str(t).strip() and not str(t).strip().startswith("@")]
    normal_tags.append("@" + owner_name)
    raw_tempo = data.get("tempo", 76)
    try:
        tempo = max(20, min(300, int(raw_tempo)))
    except (ValueError, TypeError):
        tempo = 76
    pages = data.get("sourcePages") or []
    if not isinstance(pages, list):
        pages = []
    return {
        "id": identifier, "title": title, "category": str(data.get("category") or "Misa")[:80],
        "tags": normal_tags, "tempo": tempo, "lines": lines,
        "ownerSub": owner_id, "ownerName": owner_name,
        "reviewStatus": str(data.get("reviewStatus", "pendiente"))[:32],
        "section": str(data.get("section", ""))[:80],
        "sourcePages": [p for p in pages[:30] if type(p) is int and 0 < p < 100000],
    }


def save_song(data, identifier, uid, admin, name):
    if not SONG_ID.fullmatch(identifier):
        raise ValueError("ID de canción inválido")
    current = table.get_item(Key={"id": "SONG#" + identifier}).get("Item")
    if current:
        if current.get("ownerSub") != uid and not admin:
            raise PermissionError("Solo el autor puede modificar esta canción")
        owner_id = current.get("ownerSub") or uid
        owner_name = current.get("ownerName") or name
    else:
        if not identifier.startswith("usr-") and not admin:
            raise PermissionError("Los nuevos archivos deben usar un identificador de usuario")
        owner_id, owner_name = uid, name
    song = parse_song(data, identifier, owner_id, owner_name)
    item = {"id": "SONG#" + identifier, "song": song, "ownerSub": owner_id,
            "ownerName": owner_name, "deleted": False, "updatedAt": utc_now()}
    # Atomic condition prevents two users racing to replace a fresh song.
    table.put_item(Item=item,
                   ConditionExpression="attribute_not_exists(id) OR ownerSub = :uid" if not admin else "attribute_exists(id) OR attribute_not_exists(id)",
                   ExpressionAttributeValues={":uid": uid} if not admin else None)
    return song


def delete_song(identifier, uid, admin, name):
    if not SONG_ID.fullmatch(identifier):
        raise ValueError("ID inválido")
    existing = table.get_item(Key={"id": "SONG#" + identifier}).get("Item")
    if not existing and not admin:
        raise PermissionError("Esta canción no está publicada por tu cuenta")
    if existing and existing.get("ownerSub") != uid and not admin:
        raise PermissionError("Solo el autor puede eliminar esta canción")
    owner_id = (existing or {}).get("ownerSub") or uid
    table.put_item(
        Item={"id": "SONG#" + identifier, "deleted": True, "ownerSub": owner_id,
              "ownerName": (existing or {}).get("ownerName") or name, "updatedAt": utc_now()},
        ConditionExpression="attribute_not_exists(id) OR ownerSub = :uid" if not admin else "attribute_exists(id) OR attribute_not_exists(id)",
        ExpressionAttributeValues={":uid": uid} if not admin else None,
    )


def scan_prefix(prefix, limit=150, cursor=None):
    params = {"FilterExpression": Attr("id").begins_with(prefix), "Limit": limit}
    if cursor:
        try:
            params["ExclusiveStartKey"] = json.loads(base64.urlsafe_b64decode(cursor + "==="))
        except Exception as ex:
            raise ValueError("Cursor inválido") from ex
    result = table.scan(**params)
    key = result.get("LastEvaluatedKey")
    nxt = (base64.urlsafe_b64encode(json.dumps(key).encode()).decode().rstrip("=")
           if key else None)
    return result.get("Items", []), nxt


def session_payload(data, uid, name, previous=None, identifier=None):
    title = str(data.get("title", "")).strip()[:160]
    if not title:
        raise ValueError("La sesión necesita un nombre")
    entries = data.get("songs")
    if not isinstance(entries, list):
        entries = [{"songId": key} for key in data.get("songIds", [])]
    if not 1 <= len(entries) <= 150:
        raise ValueError("La sesión necesita de 1 a 150 canciones")
    songs = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("Canción inválida en la sesión")
        sid = str(entry.get("songId") or "")
        if not SONG_ID.fullmatch(sid):
            raise ValueError("ID de canción de sesión inválido")
        try:
            transpose = int(entry.get("transpose", 0))
            speed = float(entry.get("speed", 2))
            tempo = int(entry.get("tempo", 76))
        except (ValueError, TypeError):
            raise ValueError("Ajuste musical inválido")
        if not (-24 <= transpose <= 24 and MIN_SPEED <= speed <= MAX_SPEED and 40 <= tempo <= 240):
            raise ValueError("Tono, velocidad o tempo fuera de rango")
        songs.append({"songId": sid, "transpose": transpose,
                      "speed": Decimal(str(round(speed, 4))), "tempo": tempo})
    now = utc_now()
    return {
        "id": identifier or "BS-" + secrets.token_hex(6).upper(),
        "title": title, "songIds": [s["songId"] for s in songs], "songs": songs,
        "ownerSub": (previous or {}).get("ownerSub") or uid,
        "ownerName": (previous or {}).get("ownerName") or name,
        "tags": ["@" + ((previous or {}).get("ownerName") or name)],
        "createdAt": (previous or {}).get("createdAt") or now, "updatedAt": now,
        "published": True,
    }


def save_session(data, uid, name, identifier=None):
    previous = None
    if identifier:
        if not SESSION_ID.fullmatch(identifier):
            raise ValueError("Código de sesión inválido")
        row = table.get_item(Key={"id": "SESSION#" + identifier}).get("Item")
        if not row:
            raise ValueError("Sesión no encontrada")
        previous = row.get("session") or {}
        if row.get("ownerSub") != uid:
            raise PermissionError("Solo el creador puede modificar esta sesión")
    session = session_payload(data, uid, name, previous, identifier)
    if not SESSION_ID.fullmatch(session["id"]):
        raise ValueError("Código inválido")
    item = {"id": "SESSION#" + session["id"], "ownerSub": session["ownerSub"], "session": session}
    table.put_item(Item=item, ConditionExpression="attribute_not_exists(id)" if not identifier else "ownerSub = :uid",
                   ExpressionAttributeValues=None if not identifier else {":uid": uid})
    return session


def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    path = event.get("rawPath", "")
    params = event.get("pathParameters") or {}
    try:
        if method == "GET" and path == "/changes":
            rows, cursor = scan_prefix("SONG#")
            return send(200, {"items": [{"id": x["id"][5:], "deleted": x.get("deleted", False),
                                       **({"song": x["song"]} if x.get("song") else {})}
                                      for x in rows], "cursor": cursor})
        if method == "GET" and path == "/sessions":
            rows, cursor = scan_prefix("SESSION#", 150, (event.get("queryStringParameters") or {}).get("cursor"))
            return send(200, {"items": [x["session"] for x in rows if x.get("session")],
                              "cursor": cursor})
        if method == "GET" and path.startswith("/sessions/"):
            identifier = params.get("id") or path.removeprefix("/sessions/")
            if not SESSION_ID.fullmatch(identifier):
                raise ValueError("Código inválido")
            row = table.get_item(Key={"id": "SESSION#" + identifier}).get("Item")
            return send(200, row["session"]) if row and "session" in row else send(404, {"message": "Sesión no encontrada"})
        uid, admin, claims = user_claims(event)
        if method == "GET" and path == "/profile":
            return send(200, profile_response(uid, claims))
        if method == "PUT" and path == "/profile":
            name = clean_name(event_body(event).get("displayName"))
            table.put_item(Item={"id": "USER#" + uid, "ownerSub": uid, "name": name, "updatedAt": utc_now()})
            return send(200, {"userId": uid, "displayName": name})
        name = profile_name(uid, claims)
        if method == "POST" and path == "/songs/batch":
            originals = event_body(event).get("songs", [])
            if not isinstance(originals, list) or not 1 <= len(originals) <= 20:
                raise ValueError("Carga entre 1 y 20 canciones")
            # Only user-generated IDs can be submitted in bulk; existing catalog stays protected.
            if any(not str(s.get("id", "")).startswith("usr-") for s in originals):
                raise ValueError("El lote debe contener nuevas canciones")
            created = [save_song(s, str(s["id"]), uid, admin, name) for s in originals]
            return send(200, {"ok": True, "count": len(created), "songs": created})
        if method == "PUT" and path.startswith("/songs/"):
            identifier = params.get("id") or path.removeprefix("/songs/")
            song = save_song(event_body(event), identifier, uid, admin, name)
            return send(200, {"ok": True, "song": song})
        if method == "DELETE" and path.startswith("/songs/"):
            identifier = params.get("id") or path.removeprefix("/songs/")
            delete_song(identifier, uid, admin, name)
            return send(200, {"ok": True, "id": identifier})
        if method == "POST" and path == "/sessions":
            session = save_session(event_body(event), uid, name)
            return send(201, {"session": session})
        if method == "PUT" and path.startswith("/sessions/"):
            identifier = params.get("id") or path.removeprefix("/sessions/")
            session = save_session(event_body(event), uid, name, identifier)
            return send(200, {"session": session})
        return send(404, {"message": "Ruta no encontrada"})
    except PermissionError as ex:
        return send(403, {"message": str(ex)})
    except (ValueError, TypeError, json.JSONDecodeError) as ex:
        return send(400, {"message": str(ex)})
    except ClientError as ex:
        if ex.response.get("Error", {}).get("Code") in ("ConditionalCheckFailedException", "TransactionCanceledException"):
            return send(403, {"message": "No puedes modificar un elemento de otro usuario"})
        return send(500, {"message": "Error del almacenamiento de BoscoSong"})
    except Exception:
        return send(500, {"message": "Error del servidor de BoscoSong"})
