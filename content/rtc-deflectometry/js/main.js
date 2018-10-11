'use strict';

// Button elements
const startVideoButton = document.querySelector('button#startVideo');
const connectButton = document.querySelector('button#connect');
const requestImageButton = document.querySelector('button#reqImage');
const saveImageButton = document.querySelector('button#saveImage');
const stopVideoButton = document.querySelector('button#stopVideo');
const applyConstraintsButton = document.querySelector('button#applyConstraints');
const showPatternButton = document.querySelector('button#showPattern');

startVideoButton.onclick = startVideo;
connectButton.onclick = connect;
requestImageButton.onclick = requestImage;
saveImageButton.onclick = saveImage;
stopVideoButton.onclick = stopVideo;
applyConstraintsButton.onclick = applyDesiredConstraints;
showPatternButton.onclick = showPattern;

// Settings control elements
const expSelector = document.getElementsByName('expCtrl');
const expSlider = document.querySelector('input[name="expSet"]');
const expValue = document.querySelector('output[id="expSetValue"]');
const focusSelector = document.getElementsByName('focusCtrl');
const focusSlider = document.querySelector('input[name="focusSet"]');
const focusValue = document.querySelector('output[id="focusSetValue"]');
const whtBalSlider = document.querySelector('input[name="whtBalSet"]');
const whtBalValue = document.querySelector('output[id="whtBalSetValue"]');
const zoomSlider = document.querySelector('input[name="zoomSet"]');
const zoomValue = document.querySelector('output[id="zoomSetValue"]');

// WebRTC features & elements
var videoInputSources = [];
var selectStream;
var selectTrack;
var localVideoCanvas = document.querySelector('video#outFeed');
var remoteVideoCanvas = document.querySelector('video#inFeed');
var imgCanvas = document.createElement('canvas');
var imgLink = document.createElement('a');
var incomingImgs = document.querySelector('div#incomingImages');
var overlayDivs = [];
var settingsDiv = document.querySelector('div#camSettings');
var capabilitiesDiv = document.querySelector('div#camCapabilities');

var imgContextW;
var imgContextH;

var standardConstraints = 
{
    audio: false,
    video: 
    {
        deviceId:               "",

        width:                  {   min: 320,   ideal: 640,     max: 1920   },
        height:                 {   min: 240,   ideal: 480,     max: 1080   },
        frameRate:              {   min: 0,     ideal: 30,      max: 60     },

        facingMode:             {   ideal: "user"                           }
    }
};

// Networking elements
var configuration = null;
var isInitiator;
var peerConn;
var dataChannel;

// Create a random room if not already present in the URL.
var room = window.location.hash.substring(1);
if (!room)
{
    room = window.location.hash = randomToken();
}

/////////////////////////////// WEBRTC FUNCTIONS ///////////////////////////////

function createPeerConnection(isInitiator, config)
{
    console.log('CLIENT: Creating Peer connection as initiator?', isInitiator, 'config:', config);
    peerConn = new RTCPeerConnection(config);

    peerConn.addTrack(selectTrack, selectStream);

    // Send any ICE candidates to the other peer
    peerConn.onicecandidate = function(event)
    {
        console.log('CLIENT: ICE Candidate event -> ', event);
        if (event.candidate)
        {
            sendMessage(
            {
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        }
        else
        {
            console.log('CLIENT: End of candidates.');
        }
    };

    if (isInitiator)
    {
        console.log('CLIENT: Creating Data channel.');
        dataChannel = peerConn.createDataChannel('images');
        onDataChannelCreated(dataChannel);
      
        console.log('CLIENT: Creating an offer.');
        peerConn.createOffer(onLocalSessionCreated, logError);
    }
    else
    {
        peerConn.ondatachannel = function(event)
        {
            console.log('CLIENT: OnDataChannel -> ', event.channel);
            dataChannel = event.channel;
            onDataChannelCreated(dataChannel);
        };
    }

    peerConn.ontrack = function(event)
    {
        if(!remoteVideoCanvas.srcObject)
        {
            remoteVideoCanvas.srcObject = event.streams[0];
        }
        else return;
    };
}

function onLocalSessionCreated(desc)
{
    console.log('CLIENT: Local session created ->', desc);
    peerConn.setLocalDescription(desc, function()
    {
        console.log('CLIENT: Sending local desc ->', peerConn.localDescription);
        sendMessage(peerConn.localDescription);
    }, logError);
}

function onDataChannelCreated(channel)
{
    console.log('CLIENT: OnDataChannelCreated -> ', channel);

    channel.onopen = function()
    {
        console.log('CLIENT: Data channel opened!');
        requestImageButton.disabled = false;
    };
  
    channel.onclose = function ()
    {
        console.log('CLIENT: Data channel closed!');
        requestImageButton.disabled = true;
    }

    channel.onmessage = (adapter.browserDetails.browser === 'firefox') ? receiveDataFirefoxFactory() : receiveDataChromeFactory();
}

function receiveDataChromeFactory()
{
    var buf, count;
  
    return function onmessage(event)
    {
        if (typeof event.data === 'string')
        {
            buf = window.buf = new Uint8ClampedArray(parseInt(event.data));
            count = 0;
            console.log('CLIENT: Expecting a total of ' + buf.byteLength + ' bytes.');
            return;
        }
  
        var data = new Uint8ClampedArray(event.data);
        buf.set(data, count);
  
        count += data.byteLength;
        console.log('CLIENT: Byte count -> ' + count);
  
        if (count === buf.byteLength)
        {
            console.log('CLIENT: Done. Rendering image.');
            renderIncomingPhoto(buf);
        }
    };
}
  
function receiveDataFirefoxFactory()
{
    var count, total, parts;

    return function onmessage(event)
    {
        if (typeof event.data === 'string')
        {
            total = parseInt(event.data);
            parts = [];
            count = 0;
            console.log('CLIENT: Expecting a total of ' + total + ' bytes.');
            return;
        }
  
        parts.push(event.data);
        count += event.data.size;
        console.log('CLIENT: Got ' + event.data.size + ' byte(s), ' + (total - count) + ' to go.');
  
        if (count === total)
        {
            console.log('CLIENT: Assembling payload');
            var buf = new Uint8ClampedArray(total);
            var compose = function(i, pos)
            {
                var reader = new FileReader();
                reader.onload = function()
                {
                    buf.set(new Uint8ClampedArray(this.result), pos);
                    if (i + 1 === parts.length)
                    {
                        console.log('CLIENT: Done. Rendering image.');
                        renderIncomingPhoto(buf);
                    }
                    else
                    {
                        compose(i + 1, pos + this.result.byteLength);
                    }
                };
                reader.readAsArrayBuffer(parts[i]);
            };
            compose(0, 0);
        }
    };
}

////////////////////////////// SOCKET.IO SIGNALS ///////////////////////////////

// Connect to the signaling server
var socket = io.connect();

socket.on('ipaddr', function(ipaddr)
{
    console.log('CLIENT: Server IP address -> ' + ipaddr);
});

socket.on('created', function(room, clientId)
{
    console.log('CLIENT: Created room -> ', room, ' | Client ID -> ', clientId);
    isInitiator = true;
});
  
socket.on('joined', function(room, clientId)
{
    console.log('CLIENT: Joined room -> ', room, ' | Client ID -> ', clientId);
    isInitiator = false;
});

socket.on('ready', function()
{
    console.log('CLIENT: Socket is ready.');
    if (isInitiator)    { connectButton.disabled = false; }
    else                { connectButton.disabled = true; }
});

socket.on('full', function(room)
{
    alert('CLIENT: Room ' + room + ' is full. We will create a new room for you.');
    window.location.hash = '';
    window.location.reload();
});

socket.on('message', function(message)
{
    console.log('CLIENT: Client received message -> ', message);
    signalingMessageCallback(message);
});

socket.on('imagerequest', function()
{
    console.log('CLIENT: Image request received. Sending image.');
    sendImage();
});

socket.on('log', function(array)
{
    console.log.apply(console, array);
});

socket.on('disconnect', function(reason)
{
    console.log(`CLIENT: Disconnected -> ${reason}.`);
    connectButton.disabled = false;
});

socket.on('bye', function(room)
{
    console.log(`CLIENT: Peer leaving room ${room}.`);

    // If peer did not create the room, re-enter to be creator.
    if (!isInitiator)
    {
        window.location.reload();
    }
});
  
function sendMessage(message)
{
    console.log('CLIENT: Client sending message -> ', message);
    socket.emit('message', message);
}

function signalingMessageCallback(message)
{
    if (message.type === 'offer')
    {
        console.log('CLIENT: Got offer. Sending answer to peer.');

        var desc = new RTCSessionDescription(message);

        connect();

        peerConn.setRemoteDescription(desc);
        peerConn.createAnswer(onLocalSessionCreated, logError);
    }
    else if (message.type === 'answer')
    {
        console.log('CLIENT: Got answer.');

        var desc = new RTCSessionDescription(message);

        peerConn.setRemoteDescription(desc);
    }
    else if (message.type === 'candidate')
    {
        peerConn.addIceCandidate(new RTCIceCandidate({ candidate: message.candidate }));
    }
}

///////////////////////////// STANDARD FUNCTIONS ///////////////////////////////

function connect()
{
    connectButton.disabled = true;
    createPeerConnection(isInitiator, configuration);
}

function populateDeviceList(devices)
{
    for (let k = 0; k !== devices.length; ++k)
    {
        if (devices[k].kind === 'videoinput')   { videoInputSources.push(devices[k].deviceId); }
    }

    // Update normal constraints with deviceID after the initial query
    standardConstraints.video.deviceId = videoInputSources[0];
}

function gotStream(stream)
{
    selectStream = stream;
    selectTrack = stream.getVideoTracks()[0];
    console.log(`CLIENT: Stream listing ->`, selectStream);
    console.log(`CLIENT: Track listing ->`, selectTrack);

    return stream;
}

function bindStreamToCanvas(stream)
{
    let feed = localVideoCanvas;
    feed.srcObject = stream;

    feed.onloadedmetadata = function()
    {
        imgContextW = feed.videoWidth;
        imgContextH = feed.videoHeight;
        console.log('CLIENT: gotStream with width and height -> ', imgContextW, imgContextH);
    };

    return stream;
}

function startVideo()
{
    startVideoButton.disabled = true;

    navigator.mediaDevices.getUserMedia(standardConstraints).then(gotStream).then(bindStreamToCanvas).catch(handleError);

    stopVideoButton.disabled = false;
}

function stopVideo()
{
    requestImageButton.disabled = true;
    saveImageButton.disabled = true;
    stopVideoButton.disabled = true;
    applyConstraintsButton.disabled = true;

    selectStream.getTracks().forEach(track => { track.stop(); });

    startVideoButton.disabled = false;
}

function requestImage()
{
    socket.emit('imagerequest');
}

function sendImage()
{
    imgCanvas.setAttribute("height", imgContextH);
    imgCanvas.setAttribute("width", imgContextW);
    imgCanvas.getContext('2d').drawImage(localVideoCanvas, 0, 0, imgContextW, imgContextH);
    
    // Split data channel message in chunks of this byte length.
    var CHUNK_LEN = 64000;
    var img = imgCanvas.getContext('2d').getImageData(0, 0, imgContextW, imgContextH);
    var len = img.data.byteLength;
    var n = len / CHUNK_LEN | 0;
    
    console.log('CLIENT: Sending a total of ' + len + ' byte(s).');
    
    if (!dataChannel)
    {
        logError('ERROR: Connection has not been initiated. Get two peers in the same room first!');
        return;
    }
    else if (dataChannel.readyState === 'closed')
    {
        logError('ERROR: Connection was lost. Peer closed the connection.');
        return;
    }
    
    dataChannel.send(len);
    
    // Split the photo and send in chunks of about 64KB
    for (var i = 0; i < n; i++)
    {
        var start = i * CHUNK_LEN,
        end = (i + 1) * CHUNK_LEN;
        console.log('CLIENT: ' + start + ' - ' + (end - 1));
        dataChannel.send(img.data.subarray(start, end));
    }
    
    // Send the remainder, if any
    if (len % CHUNK_LEN)
    {
        console.log('CLIENT: Last ' + len % CHUNK_LEN + ' byte(s).');
        dataChannel.send(img.data.subarray(n * CHUNK_LEN));
    }
}

function saveImage()
{
    let newestImg = incomingImgs.getElementsByTagName('canvas')[0];

    let dataURL = newestImg.toDataURL('image/png').replace("image/png", "image/octet-stream");

    imgLink.href = dataURL;
    imgLink.download = "cam1_image.png";
    imgLink.click();
}

function showPattern()
{
    var pattern = document.createElement('img');
    pattern.setAttribute('src', 'images/sin-pattern_f100_2048x1536.png');
    pattern.style.cssText = 'max-width: none;'
    pattern.addEventListener("click", function()
    {
        var closer = document.querySelector("div#overlay");
        closer.parentNode.removeChild(closer);

        if (document.cancelFullScreen)              { document.cancelFullScreen(); }
        else if (document.msCancelFullScreen)       { document.msCancelFullScreen(); }
        else if (document.mozCancelFullScreen)      { document.mozCancelFullScreen(); }
        else if (document.webkitCancelFullScreen)   { document.webkitCancelFullScreen(); }
    });

    var overlay = document.createElement('div');
    overlay.setAttribute("id", "overlay");
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; height: 100%; width: 100%; z-index:100;';
    overlay.appendChild(pattern);

    document.body.appendChild(overlay);

    if (document.documentElement.requestFullScreen)                 { document.documentElement.requestFullScreen(); }
    else if (document.documentElement.mozRequestFullScreen)         { document.documentElement.mozRequestFullScreen(); }
    else if (document.documentElement.webkitRequestFullScreen)      { document.documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT); }
}

function renderIncomingPhoto(data)
{
    var canvas = document.createElement('canvas');
    canvas.width = imgContextW;
    canvas.height = imgContextH;
    canvas.classList.add('incomingImages');
    incomingImgs.insertBefore(canvas, incomingImgs.firstChild);

    var context = canvas.getContext('2d');
    var img = context.createImageData(imgContextW, imgContextH);
    img.data.set(data);
    context.putImageData(img, 0, 0);
}

function getFeedback(stream)
{
    let constraints = stream.getVideoTracks()[0].getConstraints();
    console.log(`CLIENT: Track 1 current constraints ->`, constraints);

    let settings = stream.getVideoTracks()[0].getSettings();
    console.log(`CLIENT: Track 1 current settings ->`, settings);
    settingsDiv.textContent = JSON.stringify(settings, null, '    ');

    let capabilities = stream.getVideoTracks()[0].getCapabilities();
    console.log(`CLIENT: Track 1 current capabilities ->`, capabilities);
    capabilitiesDiv.textContent = JSON.stringify(capabilities, null, '    ');

    // Using settings and capabilities to modify on-page controls
    if ('exposureMode' in capabilities)
    {
        if (settings.exposureMode === 'continuous')     { expSelector[0].checked = true; }
        else if (settings.exposureMode === 'manual')    { expSelector[1].checked = true; }
    }
    else
    {
        console.log('CLIENT: Exposure control is not supported by ' + selectTrack.label);
    }

    if ('exposureCompensation' in capabilities)
    {
        expSlider.min = capabilities.exposureCompensation.min;
        expSlider.value = settings.exposureCompensation.value;
        expSlider.max = capabilities.exposureCompensation.max;
        expSlider.step = capabilities.exposureCompensation.step;
        expValue.innerHTML = expSlider.value;
    }
    else
    {
        console.log('CLIENT: Exposure settings are not supported by ' + selectTrack.label);
    }

    if ('focusMode' in capabilities)
    {
        if (settings.focusMode === 'continuous')        { focusSelector[0].checked = true; }
        else if (settings.focusMode === 'manual')       { focusSelector[1].checked = true; }
    }
    else
    {
        console.log('CLIENT: Focus control is not supported by ' + selectTrack.label);
    }

    
    // if ('focusCompensation' in capabilities)
    // {
    //     focusSlider.min = ?;
    //     focusSlider.value = ?;
    //     focusSlider.max = ?;
    //     focusSlider.step = ?;
    //     focusValue.innerHTML = focusSlider.value;
    // }
    // else
    // {
    //     console.log('CLIENT: Focus control is not supported by ' + selectTrack.label);
    // }

    // if ('focusCompensation' in capabilities)
    // {
    //     whtBalSlider.min = ?;
    //     whtBalSlider.value = ?;
    //     whtBalSlider.max = ?;
    //     whtBalSlider.step = ?;
    //     whtBalValue.innerHTML = whtBalSlider.value;
    // }
    // else
    // {
    //     console.log('CLIENT: White balance adjustment is not supported by ' + selectTrack.label);
    // }

    if ('zoom' in capabilities)
    {
        zoomSlider.min = capabilities.zoom.min;
        zoomSlider.value = settings.zoom;
        zoomSlider.max = capabilities.zoom.max;
        zoomSlider.step = capabilities.zoom.step;
        zoomValue.innerHTML = zoomSlider.value;
    }
    else
    {
        console.log('CLIENT: Zoom is not supported by ' + selectTrack.label);
    }

    applyConstraintsButton.disabled = false;
}

function applyDesiredConstraints()
{
    console.log('CLIENT: Currently-applied constraints ->', standardConstraints);

    /*
    stopVideo();
    */
}

/////////////////////////////// UTILITY FUNCTIONS //////////////////////////////

function randomToken()
{
    return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
}

function handleError(error)
{
    const message = `CLIENT: Error ->  ${error.name} : ${error.message}`;

    alert(message);
    console.log(message);
    startVideoButton.disabled = false;
}

function logError(err)
{
    if (!err) return;

    if (typeof err === 'string')
    {
        console.warn(err);
    } 
    else
    {
        console.warn(err.toString(), err);
    }
}

//////////////////////// \/ INITIALIZER BEGINS HERE \/ /////////////////////////

// Initial gUM scan
navigator.mediaDevices.getUserMedia({ audio: false, video: true }).catch(handleError);

let supportedConstraints = navigator.mediaDevices.getSupportedConstraints();

navigator.mediaDevices.enumerateDevices().then(populateDeviceList).then(startVideo).catch(handleError);

console.log(`CLIENT : Video sources -> `, videoInputSources);
console.log(`CLIENT : Supported constraints -> `, supportedConstraints)

if (location.hostname.match(/localhost|127\.0\.0/))
{
    socket.emit('ipaddr');
}

window.addEventListener('unload', function()
{
    console.log(`CLIENT: Unloading window. Notifying peers in ${room}.`);
    socket.emit('bye', room);
});

socket.emit('create or join', room);