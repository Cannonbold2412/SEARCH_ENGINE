"""Authenticated WebSocket proxy: browser (linear16 PCM) ↔ Deepgram live STT."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Any
from urllib.parse import urlencode

import websockets
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from src.core import decode_access_token, get_settings
from src.db.models import Person
from src.db.session import async_session
from src.dependencies import resolve_user_from_user_id

from .deepgram_stt import resolve_deepgram_language

logger = logging.getLogger(__name__)

DG_WS_BASE = "wss://api.deepgram.com/v1/listen"

_ALLOWED_SAMPLE_RATES = frozenset({8000, 16000, 22050, 24000, 44100, 48000})


def _build_deepgram_url(*, sample_rate: int, app_language: str | None, multilingual: bool) -> str:
    settings = get_settings()
    model = (settings.deepgram_model or "nova-3").strip() or "nova-3"
    params: dict[str, str] = {
        "model": model,
        "encoding": "linear16",
        "sample_rate": str(sample_rate),
        "channels": "1",
        "interim_results": "true",
        "smart_format": "true",
        "endpointing": "300",
    }
    if multilingual:
        params["language"] = "multi"
    else:
        lang = resolve_deepgram_language(app_language)
        if lang:
            params["language"] = lang
    return f"{DG_WS_BASE}?{urlencode(params)}"


async def _connect_deepgram(
    dg_key: str,
    *,
    sample_rate: int,
    app_language: str | None,
    multilingual: bool,
) -> tuple[Any, bool]:
    """Try Deepgram WebSocket; return (connection, used_multilingual_flag)."""
    headers = [("Authorization", f"Token {dg_key}")]
    attempts: list[bool] = [True, False] if multilingual else [False]
    last_err: Exception | None = None
    for use_multi in attempts:
        url = _build_deepgram_url(
            sample_rate=sample_rate,
            app_language=app_language,
            multilingual=use_multi,
        )
        try:
            ws = await websockets.connect(
                url,
                additional_headers=headers,
                open_timeout=15,
                ping_interval=20,
                ping_timeout=20,
            )
            return ws, use_multi
        except Exception as e:
            last_err = e
            logger.warning("Deepgram stream connect failed (multilingual=%s): %s", use_multi, e)
    assert last_err is not None
    raise last_err


async def handle_speech_stream(websocket: WebSocket) -> None:
    await websocket.accept()

    settings = get_settings()
    if (settings.speech_transcribe_provider or "sarvam").strip().lower() != "deepgram":
        await websocket.send_text(
            json.dumps(
                {
                    "type": "error",
                    "fallback": "upload",
                    "message": "Live streaming requires SPEECH_TRANSCRIBE_PROVIDER=deepgram.",
                }
            )
        )
        await websocket.close(code=1008)
        return

    dg_key = (settings.deepgram_api_key or "").strip()
    if not dg_key:
        await websocket.send_text(
            json.dumps(
                {
                    "type": "error",
                    "fallback": "upload",
                    "message": "Deepgram is not configured.",
                }
            )
        )
        await websocket.close(code=1008)
        return

    try:
        raw = await websocket.receive_text()
    except WebSocketDisconnect:
        return

    try:
        start = json.loads(raw)
    except json.JSONDecodeError:
        await websocket.send_text(
            json.dumps({"type": "error", "message": "Invalid JSON start message."})
        )
        await websocket.close(code=1008)
        return

    if not isinstance(start, dict) or start.get("type") != "start":
        await websocket.send_text(
            json.dumps({"type": "error", "message": 'Expected a JSON object with type "start".'})
        )
        await websocket.close(code=1008)
        return

    token = str(start.get("token") or "").strip()
    if not token:
        await websocket.send_text(json.dumps({"type": "error", "message": "Missing token."}))
        await websocket.close(code=1008)
        return

    language_code = start.get("language_code")
    app_lang: str | None
    if language_code is None or str(language_code).strip() == "":
        app_lang = None
    else:
        app_lang = str(language_code).strip().lower()

    try:
        sr = int(start.get("sample_rate") or 48000)
    except (TypeError, ValueError):
        sr = 48000
    if sr not in _ALLOWED_SAMPLE_RATES:
        sr = 48000

    multilingual = start.get("multilingual", True)
    if not isinstance(multilingual, bool):
        multilingual = True

    user_id = decode_access_token(token)
    if not user_id:
        await websocket.send_text(json.dumps({"type": "error", "message": "Unauthorized."}))
        await websocket.close(code=1008)
        return

    async def _load_user() -> Person | None:
        async with async_session() as db:
            return await resolve_user_from_user_id(db, user_id)

    user_res, dg_res = await asyncio.gather(
        _load_user(),
        _connect_deepgram(
            dg_key,
            sample_rate=sr,
            app_language=app_lang,
            multilingual=multilingual,
        ),
        return_exceptions=True,
    )

    dg_ws: Any | None = None
    if not isinstance(dg_res, Exception):
        dg_ws = dg_res[0]

    if isinstance(user_res, Exception):
        logger.warning("speech stream user load failed: %s", user_res)
        if dg_ws is not None:
            with contextlib.suppress(Exception):
                await dg_ws.close()
        await websocket.send_text(json.dumps({"type": "error", "message": "Unauthorized."}))
        await websocket.close(code=1008)
        return

    user = user_res
    if user is None:
        if dg_ws is not None:
            with contextlib.suppress(Exception):
                await dg_ws.close()
        await websocket.send_text(json.dumps({"type": "error", "message": "Unauthorized."}))
        await websocket.close(code=1008)
        return

    if isinstance(dg_res, Exception):
        logger.warning("Deepgram stream: all connect attempts failed: %s", dg_res)
        await websocket.send_text(
            json.dumps(
                {
                    "type": "error",
                    "message": "Could not connect to speech service.",
                }
            )
        )
        await websocket.close(code=1011)
        return

    await websocket.send_text(json.dumps({"type": "ready"}))

    async def forward_client_to_dg() -> None:
        close_sent = False
        try:
            while True:
                msg = await websocket.receive()
                if msg["type"] == "websocket.disconnect":
                    break
                if "bytes" in msg and msg["bytes"] is not None:
                    with contextlib.suppress(Exception):
                        await dg_ws.send(msg["bytes"])
                elif "text" in msg and msg["text"]:
                    try:
                        ctrl = json.loads(msg["text"])
                    except json.JSONDecodeError:
                        continue
                    if isinstance(ctrl, dict) and ctrl.get("type") == "stop":
                        close_sent = True
                        with contextlib.suppress(Exception):
                            await dg_ws.send(json.dumps({"type": "CloseStream"}))
                        break
        except WebSocketDisconnect:
            pass
        finally:
            if not close_sent:
                with contextlib.suppress(Exception):
                    await dg_ws.send(json.dumps({"type": "CloseStream"}))

    async def forward_dg_to_client() -> None:
        try:
            async for message in dg_ws:
                if isinstance(message, str) and websocket.client_state == WebSocketState.CONNECTED:
                    with contextlib.suppress(Exception):
                        await websocket.send_text(message)
        except Exception as e:
            logger.debug("Deepgram stream read ended: %s", e)

    t1 = asyncio.create_task(forward_client_to_dg())
    t2 = asyncio.create_task(forward_dg_to_client())
    try:
        results = await asyncio.gather(t1, t2, return_exceptions=True)
        for r in results:
            if isinstance(r, BaseException):
                logger.debug("speech stream task ended: %s", r)
    finally:
        with contextlib.suppress(Exception):
            await dg_ws.close()
        if websocket.client_state == WebSocketState.CONNECTED:
            with contextlib.suppress(Exception):
                await websocket.close()
