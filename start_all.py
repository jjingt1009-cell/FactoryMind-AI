import argparse
import os
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def run_command(command: list[str], env: dict[str, str] | None = None) -> None:
    subprocess.Popen(command, cwd=str(ROOT), env=env)


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the backend and static frontend together")
    parser.add_argument("--local", action="store_true", help="Bind to 127.0.0.1")
    parser.add_argument("--public", action="store_true", help="Bind to 0.0.0.0")
    parser.add_argument("--port", type=int, default=8080, help="Port to bind")
    args = parser.parse_args()

    if args.public and args.local:
        raise SystemExit("Choose either --local or --public, not both")

    host = "127.0.0.1" if args.local or not args.public else "0.0.0.0"
    env = os.environ.copy()
    env["HOST"] = host
    env["PORT"] = str(args.port)

    # Start backend via uvicorn
    run_command([sys.executable, "-m", "uvicorn", "src.backend:app", "--host", host, "--port", str(args.port)], env)

    # Give the backend a moment to start before printing info
    time.sleep(2)

    print(f"Backend started at http://{host}:{args.port}")
    print("Open the URL in your browser to view the dashboard")


if __name__ == "__main__":
    main()
