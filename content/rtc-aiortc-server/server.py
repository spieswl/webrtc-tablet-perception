import argparse
import asyncio
import json
import logging
import os
import ssl

from aiohttp import web

from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack


################################################################################

# Global variables
ROOT = os.path.dirname(__file__)
peerConnList = set()

# Class / function definitions
class VideoLoopback(VideoStreamTrack):
    def __init__(self, track):
        self.counter = 0
        self.track = track

    async def recv(self):
        frame = await self.track.recv()
        self.counter += 1
        return frame

async def index(request):
    content = open(os.path.join(ROOT, 'index.html'), 'r').read()
    return web.Response(content_type = 'text/html', text = content)

async def css(request):
    content = open(os.path.join(ROOT, 'css/main.css'), 'r').read()
    return web.Response(content_type = 'text/css', text = content)

async def javaScript(request):
    content = open(os.path.join(ROOT, 'js/main.js'), 'r').read()
    return web.Response(content_type = 'application/javascript', text = content)

async def rtc_offer(request):
    params = await request.json()
    offer = RTCSessionDescription(sdp = params['sdp'], type = params['type'])
    peerConn = RTCPeerConnection()
    peerConnList.add(peerConn)

    # RTC Data Channel handler
    @peerConn.on('datachannel')
    def on_datachannel(channel):
        @channel.on('message')
        def message(data):
            channel.send('pong')    # TBD - Migrate image reconstruction code over

    # ICE Connection state change handler
    @peerConn.on('iceconnectionstatechange')
    async def on_iceconnectionstatechange():
        print('SERVER: ICE Connection state is now %s.' % peerConn.iceConnectionState)
        if (peerConn.iceConnectionState == 'failed'):
            await peerConn.close()
            peerConnList.discard(peerConn)

    # Video track handler
    @peerConn.on('track')
    def on_track(track):
        print('SERVER: Track %s received.' % track.kind)

        if (track.kind == 'video'):
            local_video = VideoLoopback(track)
            peerConn.addTrack(local_video)

        @track.on('ended')
        async def on_ended():
            print('SERVER: Received track %s ended.' % track.kind)
    
    # Create response to offer
    await peerConn.setRemoteDescription(offer)

    # Create reply based on offer
    answer = await peerConn.createAnswer()
    await peerConn.setLocalDescription(answer)

    return web.Response(
        content_type = 'application/json',
        text = json.dumps({'sdp': peerConn.localDescription.sdp, 'type': peerConn.localDescription.type}))

async def close_PCs(app):
    closed = [peerConn.close() for peerConn in peerConnList]
    await asyncio.gather(*closed)
    peerConnList.clear()


################################################################################

if (__name__ == '__main__'):

    # Reading arguments from CLI instantiation
    parser = argparse.ArgumentParser(description = 'Northwestern CPL WebRTC Server')
    parser.add_argument('--port',   type = int, default = 443,      help = 'Port for HTTPS server (default: 443).')
    parser.add_argument('--verbose',            action = 'count',   help = 'Enable verbose logging in console.')
    args = parser.parse_args()

    if (args.verbose):
        logging.basicConfig(level = logging.DEBUG)
    
    # HTTPS certificate loading (necessary due to gUM requiring secure origins)
    ssl_context = ssl.SSLContext()
    ssl_context.load_cert_chain('certs/certificate.crt', 'certs/privateKey.key')

    # Setting up and running the web application with callbacks & SSL context info
    rtc_app = web.Application()
    rtc_app.router.add_get('/', index)
    rtc_app.router.add_get('/css/main.css', css)
    rtc_app.router.add_get('/js/main.js', javaScript)
    rtc_app.router.add_post('/offer', rtc_offer)
    rtc_app.on_shutdown.append(close_PCs)
    
    web.run_app(rtc_app, port = args.port, ssl_context = ssl_context)
