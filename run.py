import argparse
import os
import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the FactoryMind backend")
    parser.add_argument(
        "--local",
        action="store_true",
        help="Bind to 127.0.0.1 so only this machine can access it",
    )
    parser.add_argument(
        "--public",
        action="store_true",
        help="Bind to 0.0.0.0 so other machines on the LAN can access it",
    )
    parser.add_argument("--port", type=int, default=8080, help="Port to bind")
    args = parser.parse_args()

    if args.public and args.local:
        raise SystemExit("Choose either --local or --public, not both")

    host = "127.0.0.1" if args.local or not args.public else "0.0.0.0"
    os.environ.setdefault("HOST", host)
    os.environ.setdefault("PORT", str(args.port))

    # Target the moved backend in src package
    uvicorn.run("src.backend:app", host=host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
