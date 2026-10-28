"""Local fixtures for native WinHTTP download tests; never binds publicly."""
import functools
import json
import pathlib
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

root = pathlib.Path(sys.argv[1]).resolve()
port_file = pathlib.Path(sys.argv[2])


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path == '/redirect':
            self.send_response(302)
            self.send_header('Location', '/nadraw/latest.json')
            self.end_headers()
            return
        if self.path == '/tampered.json':
            value = json.loads((root / 'nadraw/latest.json').read_text(encoding='utf-8'))
            signature = value['signature']
            value['signature'] = ('A' if signature[0] != 'A' else 'B') + signature[1:]
            body = json.dumps(value).encode()
        elif self.path == '/truncated.exe':
            body = (root / 'nadraw/releases/NaDraw-Setup-1.0.28.exe').read_bytes()[:1000]
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


with ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(root))) as server:
    port_file.write_text(str(server.server_port), encoding='ascii')
    server.serve_forever()
