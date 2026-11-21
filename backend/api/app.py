"""BoscoSong song-change API (Python 3.12 / DynamoDB).

The bundled public catalog is immutable static JSON; writes are stored as
overrides/tombstones in DynamoDB. Only users in Cognito's editors group
are allowed to mutate songs. HTTP API JWT authorizer runs before Lambda.
"""
import base64
import json
import os
import re
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Attr

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
ID_RE = re.compile(r"^[a-zA-Z0-9._:-]{1,160}$")


def reply(status, payload):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json; charset=utf-8"},
        "body": json.dumps(payload, ensure_ascii=False, default=lambda x: float(x) if isinstance(x, Decimal) else str(x)),
    }


def require_editor(event):
    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )
    raw = claims.get("cognito:groups", [])
    if isinstance(raw, str):
        try:
            groups = json.loads(raw)
        except ValueError:
            groups = [x.strip() for x in raw.strip("[]").split(",")]
    else:
        groups = raw
    if "editors" not in groups:
        raise PermissionError("Tu cuenta no tiene permiso de edición")
    return claims.get("sub", "editor")


def parse_song(data, id_override=None):
    if not isinstance(data, dict):
        raise ValueError("La canción debe ser un objeto JSON")
    sid = str(id_override or data.get("id", ""))
    if not ID_RE.fullmatch(sid):
        raise ValueError("ID de canción no válido")
    title = str(data.get("title", "")).strip()
    if not title or len(title) > 180:
        raise ValueError("Título obligatorio, máximo 180 caracteres")
    lines = data.get("lines", [])
    if not isinstance(lines, list) or len(lines) > 500:
        raise ValueError("Máximo 500 líneas por canción")
    clean_lines = []
    for line in lines:
        if not isinstance(line, dict):
            raise ValueError("Cada línea debe ser un objeto")
        text = str(line.get("text", ""))
        if len(text) > 2000:
            raise ValueError("Línea demasiado larga")
        chords = line.get("chords", [])
        if not isinstance(chords, list) or len(chords) > 40:
            raise ValueError("Máximo 40 acordes por línea")
        clean = []
        for c in chords:
            if not isinstance(c, dict) or not isinstance(c.get("index"), int) or isinstance(c.get("index"), bool):
                raise ValueError("Posición del acorde no válida")
            idx = c["index"]
            symbol = str(c.get("symbol", "")).strip()
            if not 0 <= idx <= len(text) or not symbol or len(symbol) > 40:
                raise ValueError("Posición o símbolo del acorde incorrecto")
            clean.append({"index": idx, "symbol": symbol})
        clean_lines.append({"text": text, "chords": clean})
    tags = data.get("tags", [])
    if not isinstance(tags, list) or len(tags) > 20:
        raise ValueError("Máximo 20 etiquetas")
    tempo = data.get("tempo", 76)
    if isinstance(tempo, bool) or not isinstance(tempo, (int, Decimal)) or not 20 <= tempo <= 300:
        tempo = 76
    return {
        "id": sid,
        "title": title,
        "category": str(data.get("category", "Misa"))[:80],
        "tags": [str(tag)[:60] for tag in tags],
        "tempo": int(tempo),
        "lines": clean_lines,
        "reviewStatus": str(data.get("reviewStatus", "pendiente"))[:32],
        "section": str(data.get("section", ""))[:80],
        "sourcePages": [int(page) for page in (data.get("sourcePages") or [])[:30] if isinstance(page, int) and not isinstance(page, bool) and 0 < page <= 100000],
        "number": int(data.get("number", 0)) if isinstance(data.get("number"), int) and not isinstance(data.get("number"), bool) else 0,
    }


def put_song(song, editor):
    table.put_item(Item={
        "id": "SONG#" + song["id"],
        "song": song,
        "deleted": False,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedBy": editor,
    })


def get_changes(event):
    query = event.get("queryStringParameters") or {}
    start = None
    if query.get("cursor"):
        try:
            start = json.loads(base64.urlsafe_b64decode(query["cursor"] + "==="))
        except Exception:
            return reply(400, {"message": "Cursor no válido"})
    params = {
        "FilterExpression": Attr("id").begins_with("SONG#"),
        "Limit": 150,
        "ProjectionExpression": "id,song,deleted",
    }
    if start:
        params["ExclusiveStartKey"] = start
    result = table.scan(**params)
    changes = [
        {
            "id": row["id"][5:],
            "deleted": row.get("deleted", False),
            **({"song": row["song"]} if row.get("song") else {}),
        }
        for row in result.get("Items", [])
    ]
    key = result.get("LastEvaluatedKey")
    cursor = base64.urlsafe_b64encode(json.dumps(key).encode()).decode().rstrip("=") if key else None
    return reply(200, {"items": changes, "cursor": cursor})


def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    path = event.get("rawPath", "")
    try:
        if method == "GET" and path == "/changes":
            return get_changes(event)
        editor = require_editor(event)
        if method == "PUT" and path.startswith("/songs/"):
            sid = event.get("pathParameters", {}).get("id", "")
            song = parse_song(json.loads(event.get("body") or "{}"), sid)
            put_song(song, editor)
            return reply(200, {"ok": True, "id": sid})
        if method == "DELETE" and path.startswith("/songs/"):
            sid = event.get("pathParameters", {}).get("id", "")
            if not ID_RE.fullmatch(sid):
                return reply(400, {"message": "ID no válido"})
            table.put_item(Item={
                "id": "SONG#" + sid, "deleted": True,
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "updatedBy": editor,
            })
            return reply(200, {"ok": True, "id": sid})
        if method == "POST" and path == "/songs/batch":
            body = json.loads(event.get("body") or "{}")
            raw = body.get("songs", [])
            if not isinstance(raw, list) or not 1 <= len(raw) <= 20:
                return reply(400, {"message": "Carga entre 1 y 20 canciones"})
            songs = [parse_song(s) for s in raw]
            with table.batch_writer(overwrite_by_pkeys=["id"]) as batch:
                for song in songs:
                    batch.put_item(Item={
                        "id": "SONG#" + song["id"], "song": song, "deleted": False,
                        "updatedAt": datetime.now(timezone.utc).isoformat(),
                        "updatedBy": editor,
                    })
            return reply(200, {"ok": True, "count": len(songs)})
        return reply(404, {"message": "Ruta no encontrada"})
    except PermissionError as error:
        return reply(403, {"message": str(error)})
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        return reply(400, {"message": str(error)})
