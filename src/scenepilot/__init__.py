"""ScenePilot entry point. Run: uv run scenepilot  (listens on 0.0.0.0 so a phone on the same Wi-Fi can open it)."""
from __future__ import annotations

import os
import socket


def lan_ip() -> str | None:
    """This computer's LAN address. Looks up the route without actually sending a packet."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None


def main() -> None:
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    ip = lan_ip()
    print(f"\n  On this computer:  http://localhost:{port}")
    if ip and host == "0.0.0.0":
        print(f"  On your phone:    http://{ip}:{port}   (same Wi-Fi; the Windows firewall may need to allow it)")
    print()
    uvicorn.run("scenepilot.app:app", host=host, port=port)
