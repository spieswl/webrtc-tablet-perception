import argparse
import asyncio
import json
import logging
import os
import ssl

from aiohttp import web

ROOT = os.path.dirname(__file__)

async def index(request):
    content = open(os.path.join(ROOT, 'index.html'), 'r').read()
    return web.Response(content_type='text/html', text=content)

async def javaScript(request):
    content = open(os.path.join(ROOT, 'main.js'), 'r').read()
    return web.Response(content_type='application/javascript', text=content)


if __name__ == '__main__':

    # Reading arguments from CLI instantiation
    parser = argparse.ArgumentParser(description='Northwestern CPL WebRTC Server')
    parser.add_argument('--port',   type=int,   default=443,    help='Port for HTTPS server (default: 443).')
    parser.add_argument('--verbose',            action='count', help='Enable verbose logging in console.')
    args = parser.parse_args()

    if (args.verbose):
        logging.basicConfig(level=logging.DEBUG)
    
    # HTTPS certificate loading (necessary due to gUM requiring secure origins)
    ssl_context = ssl.SSLContext()
    ssl_context.load_cert_chain('certs/certificate.crt', 'certs/privateKey.key')

    # Setting up and running the web application with arguments & SSL context info
    web_app = web.Application()
    web_app.router.add_get('/', index)
    web_app.router.add_get('/main.js', javaScript)
    web.run(web_app, port=args.port, ssl_context=ssl_context)
