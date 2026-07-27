import argparse
import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch the dashboard and open it in your browser")
    parser.add_argument("--local", action="store_true", help="Bind to 127.0.0.1")
    parser.add_argument("--public", action="store_true", help="Bind to 0.0.0.0")
    parser.add_argument("--port", type=int, default=8080, help="Port to bind")
    args = parser.parse_args()

    if args.public and args.local:
        raise SystemExit("Choose either --local or --public, not both")

    host = "127.0.0.1" if args.local or not args.public else "0.0.0.0"
    url = f"http://127.0.0.1:{args.port}" if host == "127.0.0.1" else f"http://0.0.0.0:{args.port}"

    subprocess.Popen([
        sys.executable,
        "-m",
        "uvicorn",
        "src.backend:app",
        "--host",
        host,
        "--port",
        str(args.port),
    ], cwd=str(ROOT), env=os.environ.copy())

    time.sleep(2)
    webbrowser.open(url)
    print(f"Opened {url}")


if __name__ == "__main__":
    main()
