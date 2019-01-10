import argparse
import asyncio
import json
import logging
import os
import ssl
import time

import numpy
import cv2

from aiohttp import web
import socketio

from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack


##########################  Global vars & class defs  ##########################

ROOT = os.path.dirname(__file__)
peerConnList = set()

config_image_width = None
config_image_height = None

image_data = numpy.array([], numpy.uint8)

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


############################  Socket.IO Functions  #############################

socket = socketio.AsyncServer()

@socket.on('connect')
def connect(sid, environs):
    print('SERVER: Socket.IO connection made with client ID:', sid)

@socket.on('disconnect')
def disconnect(sid):
    print('SERVER: Socket.IO connection lost with client ID:', sid)

@socket.on('photo_dimensions')
def dimensions(sid, rmt_img_width, rmt_img_height):
    global config_image_width
    global config_image_height
    
    config_image_width = rmt_img_width
    config_image_height = rmt_img_height
    print('SERVER: Remote device is signaling the next image is captured at a resolution of %d x %d .' % (config_image_width, config_image_height))


##############################  WebRTC Functions  ##############################

async def rtc_offer(request):
    params = await request.json()
    offer = RTCSessionDescription(sdp = params['sdp'], type = params['type'])
    peerConn = RTCPeerConnection()
    peerConnList.add(peerConn)

    # RTC Data Channel handler
    @peerConn.on('datachannel')
    def on_datachannel(channel):
        start_time = None
        num_bytes = 0
        
        @channel.on('message')
        def on_message(data):
            global image_data
            nonlocal start_time
            nonlocal num_bytes

            if (start_time == None):
                start_time = time.time()

            if (data):
                num_bytes += len(data)
                decoded = numpy.frombuffer(data, numpy.uint8)
                image_data = numpy.append(image, decoded)

            if (len(data) < 64000):
                elapsed_time = time.time() - start_time
                start_time = None
                print('SERVER: Received total of %d bytes in %.1f sec (%.3f Mbps).' % (num_bytes, elapsed_time, num_bytes * 8 / elapsed_time / 1000000))
                
                # Save image off to disk and reset image_data container
                save_image_CV2(image_data, config_image_width, config_image_height)
                image_data = numpy.array([], numpy.uint8)
                

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

##########################  Image Handler Functions  ###########################

def save_image_CV2(image_data, width, height):
    byte_width = width * 4
    byte_height = height

    numpy.reshape(image_data, (byte_height, byte_width))
    cv2.imwrite("image_test.PNG", image_data)

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

    socket.attach(rtc_app)

    web.run_app(rtc_app, port = args.port, ssl_context = ssl_context)
