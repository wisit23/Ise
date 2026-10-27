"""Read-only checks through the public frontend origin, including chat routing."""
import argparse
import base64
import hashlib
import http.client
import json
import os
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, build_opener


def check(url):
    parts = urlsplit(url)
    if (parts.scheme != "https" or not parts.hostname or parts.path not in ("", "/")
            or parts.username or parts.password or parts.query or parts.fragment):
        raise ValueError("Public URL must be an HTTPS origin without credentials")
    origin = url.rstrip("/")
    opener = build_opener(ProxyHandler({}))
    for path in ("/", "/api/products/feed?limit=1", "/api/chat/socket.io/?EIO=4&transport=polling"):
        with opener.open(origin + path, timeout=20) as response:
            if response.status != 200 or urlsplit(response.url).netloc != parts.netloc:
                raise ValueError("Public route failed or redirected to another origin")
            body = response.read(2 * 1024 * 1024)
        if path.startswith("/api/products") and not isinstance(json.loads(body).get("items"), list):
            raise ValueError("Product feed response is invalid")
        if path.startswith("/api/chat") and (not body.startswith(b"0{") or not json.loads(body[1:]).get("sid")):
            raise ValueError("Socket.IO polling route did not return an Engine.IO handshake")
    # Verify the proxy forwards an actual Upgrade, rather than only HTTP polling.
    key = base64.b64encode(os.urandom(16)).decode()
    connection = http.client.HTTPSConnection(parts.hostname, parts.port or 443, timeout=20)
    try:
        connection.request("GET", "/api/chat/socket.io/?EIO=4&transport=websocket", headers={
            "Connection": "Upgrade", "Upgrade": "websocket", "Sec-WebSocket-Version": "13",
            "Sec-WebSocket-Key": key, "Origin": origin})
        response = connection.getresponse()
        expected = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
        if response.status != 101 or response.getheader("Sec-WebSocket-Accept") != expected:
            raise ValueError("Public proxy did not upgrade the chat WebSocket")
    finally:
        connection.close()
    print("Public frontend, product feed, chat polling and WebSocket checks passed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    check(parser.parse_args().url)
