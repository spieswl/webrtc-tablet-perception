'use strict';

// Button elements
const startVideoButton = document.querySelector('button#startVideo');
const connectButton = document.querySelector('button#connect');
const requestImageButton = document.querySelector('button#reqImage');
const saveImage1Button = document.querySelector('button#saveImage1');
const saveImage2Button = document.querySelector('button#saveImage2');
const sendImage1Button = document.querySelector('button#sendImage1');
const sendImage2Button = document.querySelector('button#sendImage2');
const stopVideoButton = document.querySelector('button#stopVideo');
const getFeedbackButton = document.querySelector('button#getFeedback');
const applyConstraintsButton = document.querySelector('button#applyConstraints');
const showPatternButton = document.querySelector('button#showPattern');

startVideoButton.onclick = startVideo;
connectButton.onclick = connect;
requestImageButton.onclick = requestImage;
saveImage1Button.onclick = function () { saveImage(0); };
saveImage2Button.onclick = function () { saveImage(1); };
sendImage1Button.onclick = function () { sendImage(0); };
sendImage2Button.onclick = function () { sendImage(1); };
stopVideoButton.onclick = stopVideo;
getFeedbackButton.onclick = getFeedback;
applyConstraintsButton.onclick = applyDesiredConstraints;
showPatternButton.onclick = showPattern;

// WebRTC features & elements
var videoInputSources = [];
var streamList = [];
var trackList = [];
var localVideoCanvas = [ document.querySelector('video#outFeed1'), document.querySelector('video#outFeed2') ];
var remoteVideoCanvas = [ document.querySelector('video#inFeed1'), document.querySelector('video#inFeed2') ];
var imgCanvas = [ document.createElement('canvas'), document.createElement('canvas') ];
var imgLink = [ document.createElement('a'), document.createElement('a') ];
var incomingImgs = document.getElementById('incomingImages');
var overlayDivs = [];

var settingsDivs = [ document.querySelector('div#fbSettings1'), document.querySelector('div#fbSettings2') ];
var capabilitiesDivs = [ document.querySelector('div#fbCapabilities1'), document.querySelector('div#fbCapabilities2') ];

const cameraFacingOrder = [ "user", "environment" ];
const initConstraints = { audio: false, video: true };
var imgContextW;
var imgContextH;
var boundVideoIndex = 0;

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

function connect()
{
    connectButton.disabled = true;
    createPeerConnection(isInitiator, configuration);
}

function createPeerConnection(isInitiator, config)
{
    console.log('CONSOLE: Creating Peer connection as initiator?', isInitiator, 'config:', config);
    peerConn = new RTCPeerConnection(config);

    for (let k = 0; k !== streamList.length; ++k)
    {
        peerConn.addTrack(trackList[k], streamList[k]);
    }

    // Send any ICE candidates to the other peer
    peerConn.onicecandidate = function(event)
    {
        console.log('CONSOLE: ICE Candidate event -> ', event);
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
            console.log('CONSOLE: End of candidates.');
        }
    };

    if (isInitiator)
    {
        console.log('CONSOLE: Creating Data channel.');
        dataChannel = peerConn.createDataChannel('images');
        onDataChannelCreated(dataChannel);
      
        console.log('CONSOLE: Creating an offer.');
        peerConn.createOffer(onLocalSessionCreated, logError);
    }
    else
    {
        peerConn.ondatachannel = function(event)
        {
            console.log('CONSOLE: OnDataChannel -> ', event.channel);
            dataChannel = event.channel;
            onDataChannelCreated(dataChannel);
        };
    }

    peerConn.onnegotiationneeded = function()
    {
        console.log('CONSOLE: Negotiation needed - peerConn');
        
    };

    peerConn.ontrack = function(event)
    {
        if(!remoteVideoCanvas[0].srcObject)
        {
            remoteVideoCanvas[0].srcObject = event.streams[0];
        }
        else if (!remoteVideoCanvas[1].srcObject)
        {
            remoteVideoCanvas[1].srcObject = event.streams[0];
        }
        else return;
    };
}

function onLocalSessionCreated(desc)
{
    console.log('CONSOLE: Local session created:', desc);
    peerConn.setLocalDescription(desc, function()
    {
        console.log('CONSOLE: Sending local desc:', peerConn.localDescription);
        sendMessage(peerConn.localDescription);
    }, logError);
}

function onDataChannelCreated(channel)
{
    console.log('CONSOLE: OnDataChannelCreated -> ', channel);

    channel.onopen = function()
    {
        console.log('CONSOLE: Data channel opened!');
    };
  
    channel.onclose = function ()
    {
        console.log('CONSOLE: Data channel closed!');
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
            console.log('CONSOLE: Expecting a total of ' + buf.byteLength + ' bytes.');
            return;
        }
  
        var data = new Uint8ClampedArray(event.data);
        buf.set(data, count);
  
        count += data.byteLength;
        console.log('CONSOLE: Byte count -> ' + count);
  
        if (count === buf.byteLength)
        {
            console.log('CONSOLE: Done. Rendering image.');
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
            console.log('Expecting a total of ' + total + ' bytes');
            return;
        }
  
        parts.push(event.data);
        count += event.data.size;
        console.log('CONSOLE: Got ' + event.data.size + ' byte(s), ' + (total - count) + ' to go.');
  
        if (count === total)
        {
            console.log('CONSOLE: Assembling payload');
            var buf = new Uint8ClampedArray(total);
            var compose = function(i, pos)
            {
                var reader = new FileReader();
                reader.onload = function()
                {
                    buf.set(new Uint8ClampedArray(this.result), pos);
                    if (i + 1 === parts.length)
                    {
                        console.log('CONSOLE: Done. Rendering image.');
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
    console.log('CONSOLE: Server IP address -> ' + ipaddr);
});

socket.on('created', function(room, clientId)
{
    console.log('CONSOLE: Created room -> ', room, ' | Client ID -> ', clientId);
    isInitiator = true;
});
  
socket.on('joined', function(room, clientId)
{
    console.log('CONSOLE: This peer has joined room', room, 'with client ID', clientId);
    isInitiator = false;
});

socket.on('ready', function()
{
    console.log('CONSOLE: Socket is ready.');
    if (isInitiator)    { connectButton.disabled = false; }
    else                { connectButton.disabled = true; }
});

socket.on('full', function(room)
{
    alert('CONSOLE: Room ' + room + ' is full. We will create a new room for you.');
    window.location.hash = '';
    window.location.reload();
});

socket.on('message', function(message)
{
    console.log('CONSOLE: Client received message -> ', message);
    signalingMessageCallback(message);
});

socket.on('imagerequest', function()
{
    console.log('CONSOLE: Image request received. Sending image from feed 1.');
    sendImage(0);
});

socket.on('log', function(array)
{
    console.log.apply(console, array);
});

socket.on('disconnect', function(reason)
{
    console.log(`CONSOLE: Disconnected -> ${reason}.`);
    connectButton.disabled = false;
});

socket.on('bye', function(room)
{
    console.log(`CONSOLE: Peer leaving room ${room}.`);

    // If peer did not create the room, re-enter to be creator.
    if (!isInitiator) {
        window.location.reload();
    }
});
  
function sendMessage(message)
{
    console.log('CONSOLE: Client sending message -> ', message);
    socket.emit('message', message);
}

function signalingMessageCallback(message)
{
    if (message.type === 'offer')
    {
        console.log('CONSOLE: Got offer. Sending answer to peer.');

        var desc = new RTCSessionDescription(message);

        connect();

        peerConn.setRemoteDescription(desc);
        peerConn.createAnswer(onLocalSessionCreated, logError);
    }
    else if (message.type === 'answer')
    {
        console.log('CONSOLE: Got answer.');

        var desc = new RTCSessionDescription(message);

        peerConn.setRemoteDescription(desc);
    }
    else if (message.type === 'candidate')
    {
        peerConn.addIceCandidate(new RTCIceCandidate({ candidate: message.candidate }));
    }
}

///////////////////////////// STANDARD FUNCTIONS ///////////////////////////////

function populateDeviceList(devices)
{
    for (let k = 0; k !== devices.length; ++k)
    {
        if (devices[k].kind === 'videoinput')   { videoInputSources.push(devices[k].deviceId); }
    }
}

function getStreamConstraints(counter)
{
    const constraints = {};

    constraints.audio = false;
    constraints.video =
    {
        deviceId:               videoInputSources[counter],

        width:                  {   min: 320,   exact: 640,     max: 1920   },
        height:                 {   min: 240,   exact: 480,     max: 1080   },
        frameRate:              {   min: 0,     ideal: 30,      max: 60     },

        facingMode:             {   ideal: cameraFacingOrder[counter]       }
    };

    return constraints;
}

function gotStream(stream)
{
    let localTrack = stream.getVideoTracks()[0];
    console.log(`CONSOLE: Track`, boundVideoIndex+1 ,`listing ->`, localTrack);
    
    streamList.push(stream);
    trackList.push(localTrack);

    return stream;
}

function bindStreamToCanvas(stream)
{
    const track = stream.getVideoTracks()[0];
    let feed = localVideoCanvas[boundVideoIndex];
    feed.srcObject = stream;

    feed.onloadedmetadata = function()
    {
        imgContextW = feed.videoWidth;
        imgContextH = feed.videoHeight;
        console.log('CONSOLE: gotStream with width and height -> ', imgContextW, imgContextH);
        console.log(`CONSOLE: Track`, boundVideoIndex ,`capabilities ->`, track.getCapabilities());
        console.log(`CONSOLE: Track`, boundVideoIndex ,`settings ->`, track.getSettings());
    };

    boundVideoIndex++;
}

function startVideo()
{
    startVideoButton.disabled = true;

    boundVideoIndex = 0;
    streamList = [];
    trackList = [];

    for (let k = 0; k !== videoInputSources.length; ++k)
    {
        navigator.mediaDevices.getUserMedia(getStreamConstraints(k)).then(gotStream).then(bindStreamToCanvas).catch(handleError);
    }
    
    requestImageButton.disabled = false;
    saveImage1Button.disabled = false;
    saveImage2Button.disabled = false;
    sendImage1Button.disabled = false;
    sendImage2Button.disabled = false;
    stopVideoButton.disabled = false;
    getFeedbackButton.disabled = false;
}

function stopVideo()
{
    saveImage1Button.disabled = true;
    saveImage2Button.disabled = true;
    sendImage1Button.disabled = true;
    sendImage2Button.disabled = true;
    stopVideoButton.disabled = true;
    getFeedbackButton.disabled = true;
    applyConstraintsButton.disabled = true;

    for (let k = 0; k !== streamList.length; ++k)
    {
        streamList[k].getTracks().forEach(track => { track.stop(); });
    }

    startVideoButton.disabled = false;
}

function requestImage()
{
    socket.emit('imagerequest');
}

function saveImage(value)
{
    var settings = trackList[value].getSettings();

    imgCanvas[value].setAttribute("height", settings.height);
    imgCanvas[value].setAttribute("width", settings.width);
    imgCanvas[value].getContext('2d').drawImage(localVideoCanvas[value], 0, 0, settings.width, settings.height);

    let dataURL = imgCanvas[value].toDataURL('image/png').replace("image/png", "image/octet-stream");
    
    imgLink[value].href = dataURL;
    imgLink[value].download = "cam" + String(value) + "_image.png";
    imgLink[value].click();
}

function sendImage(value)
{
    var settings = trackList[value].getSettings();

    imgCanvas[value].setAttribute("height", settings.height);
    imgCanvas[value].setAttribute("width", settings.width);
    imgCanvas[value].getContext('2d').drawImage(localVideoCanvas[value], 0, 0, settings.width, settings.height);

    // Split data channel message in chunks of this byte length.
    var CHUNK_LEN = 64000;
    var img = imgCanvas[value].getContext('2d').getImageData(0, 0, imgContextW, imgContextH);
    var len = img.data.byteLength;
    var n = len / CHUNK_LEN | 0;
    
    console.log('CONSOLE: Sending a total of ' + len + ' byte(s).');
    
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
        console.log('CONSOLE: ' + start + ' - ' + (end - 1));
        dataChannel.send(img.data.subarray(start, end));
    }
    
    // Send the remainder, if any
    if (len % CHUNK_LEN)
    {
        console.log('CONSOLE: Last ' + len % CHUNK_LEN + ' byte(s).');
        dataChannel.send(img.data.subarray(n * CHUNK_LEN));
    }
}

function showPattern()
{
    var pattern = document.createElement('img');
    pattern.setAttribute('src', 'images/sin-pattern_2048x2048.png');
    pattern.style.cssText = 'max-width: none;'
    pattern.addEventListener("click", function()
    {
        console.log("TESTING");
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

function getFeedback()
{
    applyConstraintsButton.disabled = false;

    for (let k = 0; k !== streamList.length; ++k)
    {
        let settings = trackList[k].getSettings();
        settingsDivs[k].textContent = JSON.stringify(settings, null, '    ');

        let capabilities = trackList[k].getCapabilities();
        capabilitiesDivs[k].textContent = JSON.stringify(capabilities, null, '    ');
    }
}

function applyDesiredConstraints()
{
    ;
}

/////////////////////////////// UTILITY FUNCTIONS //////////////////////////////

function randomToken()
{
    return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
}

function handleError(error)
{
    const message = `CONSOLE: Error ->  ${error.name} : ${error.message}`;

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
navigator.mediaDevices.getUserMedia(initConstraints).catch(handleError);
navigator.mediaDevices.enumerateDevices().then(populateDeviceList).then(startVideo).catch(handleError);
console.log(`CONSOLE : Video sources -> `, videoInputSources);

let supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
console.log(`CONSOLE : Supported constraints -> `, supportedConstraints)

if (location.hostname.match(/localhost|127\.0\.0/))
{
    socket.emit('ipaddr');
}

window.addEventListener('unload', function()
{
    console.log(`CONSOLE: Unloading window. Notifying peers in ${room}.`);
    socket.emit('bye', room);
});

// Make a move on a room.
socket.emit('create or join', room);