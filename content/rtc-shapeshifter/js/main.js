'use strict';

// Button elements
const connectButton = document.querySelector('button#connect');
const startSequenceButton = document.querySelector('button#startSequence');
const applyConstraintsButton = document.querySelector('button#applyConstraints');

connectButton.onclick = connect;
startSequenceButton.onclick = startSequence;
applyConstraintsButton.onclick = applyDesiredConstraints;

// Settings control elements
const expSelector = document.getElementsByName('expCtrl');
const expSlider = document.querySelector('input[name="expSet"]');
const expValue = document.querySelector('output[id="expSetValue"]');
const focusSelector = document.getElementsByName('focusCtrl');
const focusSlider = document.querySelector('input[name="focusSet"]');
const focusValue = document.querySelector('output[id="focusSetValue"]');
const whtBalSelector = document.getElementsByName('whtBalCtrl');
const whtBalSlider = document.querySelector('input[name="whtBalSet"]');
const whtBalValue = document.querySelector('output[id="whtBalSetValue"]');
const zoomSlider = document.querySelector('input[name="zoomSet"]');
const zoomValue = document.querySelector('output[id="zoomSetValue"]');

// WebRTC features & elements
var supportedDevices = [];
var supportedConstraints;

var localStream;
var remoteStream;

var standardConstraints = 
{
    audio: false,
    video: 
    {
        deviceId:               "",

        width:                  {   min: 320,   ideal: 640,     max: 1920   },
        height:                 {   min: 240,   ideal: 480,     max: 1080   },
        frameRate:              {   min: 0,     ideal: 30,      max: 60     },

        facingMode:             {   ideal: "environment"                    }
    }
};
var imgContextW = 640;
var imgContextH = 480;

// Displayed page elements
var localVideoCanvas = document.createElement('video');
var remoteVideoCanvas = document.querySelector('video#inFeed');
var remoteImgs = document.querySelector('div#remoteImages');
var newImgLink = document.createElement('a');
var newImgCanvas = document.createElement('canvas');

var overlayDivs = [];

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

function startVideo()
{
    navigator.mediaDevices.getUserMedia(standardConstraints).then(gotStream).catch(handleError);
}

function stopVideo()
{
    selectedStream.getTracks().forEach(track => { track.stop(); });
}

function populateDeviceList(devices)
{
    for (let k = 0; k !== devices.length; ++k)
    {
        if (devices[k].kind === 'videoinput')   { supportedDevices.push(devices[k].deviceId); }
    }
    console.log(`CLIENT : Supported video devices -> `, supportedDevices);

    // Update normal constraints with deviceID after the initial query
    standardConstraints.video.deviceId = supportedDevices[0];
}

function gotStream(stream)
{
    localStream = stream;
    
    console.log(`CLIENT: Local stream listing ->`, localStream);
    console.log(`CLIENT: Local track listing ->`, localStream.getVideoTracks()[0]);

    localVideoCanvas.srcObject = localStream;

    localVideoCanvas.addEventListener('loadedmetadata', (e) =>
    {
        window.setTimeout(() => (getFeedback(localStream)), 500);
    });

    return localStream;
}

function startSequence()
{
    console.log("TODO: NOT YET DEFINED.");
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

function renderIncomingPhoto(data)
{
    var canvas = document.createElement('canvas');
    canvas.width = imgContextW;
    canvas.height = imgContextH;
    canvas.classList.add('incomingImages');
    remoteImgs.insertBefore(canvas, remoteImgs.firstChild);
    
    var context = canvas.getContext('2d');
    var img = context.createImageData(imgContextW, imgContextH);
    img.data.set(data);
    context.putImageData(img, 0, 0);
}

function saveImage()
{
    let newestImg = remoteImgs.getElementsByTagName('canvas')[0];
    let dataURL = newestImg.toDataURL('image/png').replace("image/png", "image/octet-stream");

    newImgLink.href = dataURL;
    newImgLink.download = "cam1_image.png";
    newImgLink.click();
}

function getFeedback(stream)
{
    let track = stream.getVideoTracks()[0];

    let constraints = track.getConstraints();
    console.log(`CLIENT: Track constraints ->`, constraints);

    let settings = track.getSettings();
    console.log(`CLIENT: Track settings ->`, settings);

    let capabilities = track.getCapabilities();
    console.log(`CLIENT: Track capabilities ->`, capabilities);

    // Using settings and capabilities to modify on-page controls
    if ('exposureMode' in capabilities)
    {
        if (settings.exposureMode === 'continuous')     { expSelector[0].checked = true; }
        else if (settings.exposureMode === 'manual')    { expSelector[1].checked = true; }

        for (var k = 0; k < expSelector.length; k++)
        {
            expSelector[k].disabled = false;
        }
    }
    else
    {
        console.log('CLIENT: Exposure control is not supported by ' + track.label);
    }

    if ('exposureCompensation' in capabilities)
    {
        expSlider.min = capabilities.exposureCompensation.min;
        expSlider.value = settings.exposureCompensation.value;
        expSlider.max = capabilities.exposureCompensation.max;
        expSlider.step = capabilities.exposureCompensation.step;
        expValue.innerHTML = expSlider.value;

        expSlider.disabled = false;
    }
    else
    {
        console.log('CLIENT: Exposure setting adjustment is not supported by ' + track.label);
    }

    if ('focusMode' in capabilities)
    {
        if (settings.focusMode === 'continuous')        { focusSelector[0].checked = true; }
        else if (settings.focusMode === 'single-shot')  { focusSelector[1].checked = true; }
        else if (settings.focusMode === 'manual')       { focusSelector[2].checked = true; }

        for (var k = 0; k < focusSelector.length; k++)
        {
            focusSelector[k].disabled = false;
        }
    }
    else
    {
        console.log('CLIENT: Focus control is not supported by ' + track.label);
    }

    if ('focusCompensation' in capabilities)
    {
        focusSlider.min = capabilities.focusCompensation.min;
        focusSlider.value = settings.focusCompensation.value;
        focusSlider.max = capabilities.focusCompensation.max;
        focusSlider.step = capabilities.focusCompensation.step;
        focusValue.innerHTML = focusSlider.value;

        focusSlider.disabled = false;
    }
    else
    {
        console.log('CLIENT: Focus compensation adjustment is not supported by ' + track.label);
    }

    if ('whiteBalanceMode' in capabilities)
    {
        if (settings.whiteBalanceMode === 'continuous')          { whtBalSelector[0].checked = true; }
        else if (settings.whiteBalanceMode === 'single-shot')    { whtBalSelector[1].checked = true; }
        else if (settings.whiteBalanceMode === 'manual')         { whtBalSelector[2].checked = true; }

        for (var k = 0; k < whtBalSelector.length; k++)
        {
            whtBalSelector[k].disabled = false;
        }
    }
    else
    {
        console.log('CLIENT: White balance adjustment is not supported by ' + track.label);
    }

    if ('zoom' in capabilities)
    {
        zoomSlider.min = capabilities.zoom.min;
        zoomSlider.value = settings.zoom;
        zoomSlider.max = capabilities.zoom.max;
        zoomSlider.step = capabilities.zoom.step;
        zoomValue.innerHTML = zoomSlider.value;

        zoomSlider.disabled = false;
    }
    else
    {
        console.log('CLIENT: Zoom is not supported by ' + track.label);
    }

    applyConstraintsButton.disabled = false;
}

function applyDesiredConstraints()
{
    console.log("TODO: NOT YET DEFINED.");
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
navigator.mediaDevices.getUserMedia({ audio: false, video: true }).then(
    function()
    {
        supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
        console.log(`CLIENT : Locally supported constraints -> `, supportedConstraints);

        navigator.mediaDevices.enumerateDevices().then(populateDeviceList);
    }
).catch(handleError);

startVideo();

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