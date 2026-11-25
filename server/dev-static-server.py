import http.server
import socketserver
import os

PORT = 3000
DIRECTORY = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'Milestone-2', 'SourceCode'))

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), NoCacheHTTPRequestHandler) as httpd:
    print(f"Serving {DIRECTORY} on http://localhost:{PORT} with NO-CACHE headers")
    httpd.serve_forever()
