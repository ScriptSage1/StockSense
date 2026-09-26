"""Local stand-in for Redis (no install/admin needed): an in-memory fakeredis server on :6379."""
from fakeredis import TcpFakeServer

if __name__ == "__main__":
    server = TcpFakeServer(("127.0.0.1", 6379), server_type="redis")
    print("fake redis listening on 127.0.0.1:6379", flush=True)
    server.serve_forever()
