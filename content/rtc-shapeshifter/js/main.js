'use strict';

// Button elements
const connectButton = document.querySelector('button#connect');
const requestImageButton = document.querySelector('button#requestImage');
const applyConstraintsButton = document.querySelector('button#applyConstraints');

connectButton.onclick = connect;
requestImageButton.onclick = requestImage;
applyConstraintsButton.onclick = applyDesiredConstraints;

// Settings control elements
const expSelector = document.getElementsByName('expCtrl');
const expCompSlider = document.querySelector('input[name="expCompSet"]');
const expCompValue = document.querySelector('output[id="expCompValue"]');
const expTimeSlider = document.querySelector('input[name="expTimeSet"]');
const expTimeValue = document.querySelector('output[id="expTimeValue"]');
const isoSlider = document.querySelector('input[name="isoSet"]');
const isoValue = document.querySelector('output[id="isoValue"]');
const focusSelector = document.getElementsByName('focusCtrl');
const focusSlider = document.querySelector('input[name="focusDistSet"]');
const focusValue = document.querySelector('output[id="focusDistValue"]');
const whtBalSelector = document.getElementsByName('whtBalCtrl');
const colorTempSlider = document.querySelector('input[name="colorTempSet"]');
const colorTempValue = document.querySelector('output[id="colorTempValue"]');
const zoomSlider = document.querySelector('input[name="zoomSet"]');
const zoomValue = document.querySelector('output[id="zoomValue"]');

// WebRTC features & elements
var supportedDevices = [];
var supportedConstraints;

var localStream;
var localImageCapture;
var localConstraints;
var localSettings;
var localCapabilities;
var remoteStream;
var remoteConstraints;
var remoteSettings;
var remoteCapabilities;

var imageSaveCount = 0;

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

// Displayed page elements
var remoteVideoCanvas = document.querySelector('video#inFeed');
var remoteImgs = document.querySelector('div#remoteImages');

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
    localStream.getTracks().forEach(track => { track.stop(); });
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

    var tempLocalVideo = document.createElement('video');
    tempLocalVideo.srcObject = localStream;
    tempLocalVideo.addEventListener('loadedmetadata', (e) =>
    {
        window.setTimeout(() => (getFeedback(localStream)), 500);
    });

    localImageCapture = new ImageCapture(localStream.getVideoTracks()[0]);

    console.log(`CLIENT: Local stream listing ->`, localStream);
    console.log(`CLIENT: Local track listing ->`, localStream.getVideoTracks()[0]);
    console.log(`CLIENT: Local image capture ->`, localImageCapture);

    return localStream;
}

function requestImage()
{
    socket.emit('imagerequest');
}

function sendImage()
{
    localImageCapture.grabFrame().then(imageBitmap =>
    {
        // Local canvas for temporary image storage
        var canvas = document.createElement('canvas');
        canvas.width = 640;     // imageBitmap.width;
        canvas.height = 480;    // imageBitmap.height;
        canvas.getContext('2d').drawImage(imageBitmap, 0, 0, 640, 480);

        // Split data channel message in chunks of this byte length.
        var CHUNK_LEN = 64000;
        var img = canvas.getContext('2d').getImageData(0, 0, 640, 480);
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
    })
    .catch(err => console.error('CLIENT: grabFrame() error ->', err));
}

function renderIncomingPhoto(data)
{
    // Populating the Remote Image div
    var canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    canvas.classList.add('remoteImages');
    remoteImgs.insertBefore(canvas, remoteImgs.firstChild);
    
    var context = canvas.getContext('2d');
    var img = context.createImageData(640, 480);
    img.data.set(data);
    context.putImageData(img, 0, 0);

    // Saving the image
    let latestImg = remoteImgs.getElementsByTagName('canvas')[0];
    let dataURL = latestImg.toDataURL('image/png').replace("image/png", "image/octet-stream");

    let newImgLink = document.createElement('a');
    newImgLink.href = dataURL;
    newImgLink.download = "cam1_image" + imageSaveCount + ".png";
    newImgLink.click();

    // Update the global image counter (refreshes on load)
    imageSaveCount++;
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

    // Using settings and capabilities to modify on-page controls - not all controls are supported!!!
    // You may add and remove these, as necessary. Make sure you update the constraints being passed
    // to track.applyConstraints() in order to reflect the added (or removed) controls.

    /* EXPOSURE CONTROL MODE */
    if ('exposureMode' in capabilities)
    {
        if      (settings.exposureMode === 'continuous')    { expSelector[0].checked = true; }
        else if (settings.exposureMode === 'manual')        { expSelector[1].checked = true; }

        for (var k = 0; k < expSelector.length; k++)
        {
            expSelector[k].disabled = false;
        }
    }
    else
    {
        console.log('CLIENT: Exposure control is not supported by ' + track.label);
    }

    /* ---------------------- EXPOSURE COMPENSATION SETTING --------------------- */
    if ('exposureCompensation' in capabilities)
    {
        expCompSlider.min = capabilities.exposureCompensation.min;
        expCompSlider.value = settings.exposureCompensation.value;
        expCompSlider.max = capabilities.exposureCompensation.max;
        expCompSlider.step = capabilities.exposureCompensation.step;
        expCompValue.innerHTML = expCompSlider.value;

        expCompSlider.oninput = function(event) { expCompValue.innerHTML = event.target.value; }

        expCompSlider.disabled = false;
    }
    else
    {
        expCompSlider.value = 0;
        console.log('CLIENT: Exposure compensation adjustment is not supported by ' + track.label);
    }

    /* ------------------------- EXPOSURE TIME SETTING -------------------------- */
    if ('exposureTime' in capabilities)
    {
        expTimeSlider.min = capabilities.exposureTime.min;
        expTimeSlider.value = settings.exposureTime.value;
        expTimeSlider.max = capabilities.exposureTime.max;
        expTimeSlider.step = capabilities.exposureTime.step;
        expTimeValue.innerHTML = expTimeSlider.value;

        expTimeSlider.oninput = function(event) { expTimeValue.innerHTML = event.target.value; }

        expTimeSlider.disabled = false;
    }
    else
    {
        expTimeSlider.value = 0;
        console.log('CLIENT: Exposure time adjustment is not supported by ' + track.label);
    }

    /* ------------------------------- ISO SETTING ------------------------------ */
    if ('iso' in capabilities)
    {
        isoSlider.min = capabilities.iso.min;
        isoSlider.value = settings.iso.value;
        isoSlider.max = capabilities.iso.max;
        isoSlider.step = capabilities.iso.step;
        isoValue.innerHTML = isoSlider.value;

        isoSlider.oninput = function(event) { isoValue.innerHTML = event.target.value; }

        isoSlider.disabled = false;
    }
    else
    {
        isoSlider.value = 0;
        console.log('CLIENT: ISO adjustment is not supported by ' + track.label);
    }

    /* ------------------------- FOCUS CONTROL SELECTION ------------------------ */
    if ('focusMode' in capabilities)
    {
        if      (settings.focusMode === 'continuous')   { focusSelector[0].checked = true; }
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

    /* ------------------------- FOCUS DISTANCE SETTING ------------------------- */
    if ('focusDistance' in capabilities)
    {
        focusSlider.min = capabilities.focusDistance.min;
        focusSlider.value = settings.focusDistance.value;
        focusSlider.max = capabilities.focusDistance.max;
        focusSlider.step = capabilities.focusDistance.step;
        focusValue.innerHTML = focusSlider.value;

        focusSlider.oninput = function(event) { focusValue.innerHTML = event.target.value; }

        focusSlider.disabled = false;
    }
    else
    {
        focusSlider.value = 0;
        console.log('CLIENT: Focal distance adjustment is not supported by ' + track.label);
    }

    /* ----------------------- WHITE BALANCE CONTROL MODE ----------------------- */
    if ('whiteBalanceMode' in capabilities)
    {
        if      (settings.whiteBalanceMode === 'continuous')    { whtBalSelector[0].checked = true; }
        else if (settings.whiteBalanceMode === 'manual')        { whtBalSelector[1].checked = true; }
        else if (settings.whiteBalanceMode === 'none')          { whtBalSelector[2].checked = true; }

        for (var k = 0; k < whtBalSelector.length; k++)
        {
            whtBalSelector[k].disabled = false;
        }
    }
    else
    {
        console.log('CLIENT: White balance control is not supported by ' + track.label);
    }

    /* ----------------------- COLOR TEMPERATURE SETTING ------------------------ */
    if ('colorTemperature' in capabilities)
    {
        colorTempSlider.min = 2500;
        colorTempSlider.value = 5500;
        colorTempSlider.max = 10000;
        colorTempSlider.step = 100;
        colorTempValue.innerHTML = colorTempSlider.value;

        colorTempSlider.oninput = function(event) { colorTempValue.innerHTML = event.target.value; }

        colorTempSlider.disabled = false;
    }
    else
    {
        colorTempSlider.value = 0;
        console.log('CLIENT: Color temperature adjustment is not supported by ' + track.label);
    }

     /* ----------------------------- ZOOM SETTING ------------------------------ */
    if ('zoom' in capabilities)
    {
        zoomSlider.min = capabilities.zoom.min;
        zoomSlider.value = settings.zoom;
        zoomSlider.max = capabilities.zoom.max;
        zoomSlider.step = capabilities.zoom.step;
        zoomValue.innerHTML = zoomSlider.value;

        zoomSlider.oninput = function(event) { zoomValue.innerHTML = event.target.value; }

        zoomSlider.disabled = false;
    }
    else
    {
        zoomSlider.value = 0;
        console.log('CLIENT: Zoom is not supported by ' + track.label);
    }

    applyConstraintsButton.disabled = false;
}

function applyDesiredConstraints()
{
    var expToggle;
    var focusToggle;
    var whtBalToggle;

    // Conditionals to check the status of the radio buttons before plugging them into the constraints applicator.
    if      (document.getElementsByName('expCtrl')[0].checked)  { expToggle = "continuous"; }
    else if (document.getElementsByName('expCtrl')[1].checked)  { expToggle = "manual";     }
    else                                                        { expToggle = "";           }

    if      (document.getElementsByName('focusCtrl')[0].checked)    { focusToggle = "continuous";   }
    else if (document.getElementsByName('focusCtrl')[1].checked)    { focusToggle = "single-shot";       }
    else if (document.getElementsByName('focusCtrl')[2].checked)    { focusToggle = "manual";       }
    else                                                            { focusToggle = "";             }

    if      (document.getElementsByName('whtBalCtrl')[0].checked)   { whtBalToggle = "continuous";  }
    else if (document.getElementsByName('whtBalCtrl')[1].checked)   { whtBalToggle = "manual";      }
    else                                                            { whtBalToggle = "";            }

    let constraints =
    {
        advanced: 
        [{
                exposureMode:           expToggle,
                exposureCompensation:   expCompSlider.value,
                //exposureTime:           expTimeSlider.value,
                //iso:                    isoSlider.value,
                focusMode:              focusToggle,
                //focusDistance:          focusSlider.value,
                whiteBalanceMode:       whtBalToggle,
                //colorTemperature:       2500,    // colorTempSlider.value,
                zoom:                   zoomSlider.value
        }]
    }

    let track = localStream.getVideoTracks()[0];
    track.applyConstraints(constraints).then(function()
    {
        console.log('CLIENT: Newly applied constraints -> ', constraints);

        // Updated details
        console.log(`CLIENT: Updated track constraints ->`, track.getConstraints());
        console.log(`CLIENT: Updated track settings ->`, track.getSettings());
        console.log(`CLIENT: Updated track capabilities ->`, track.getCapabilities());
    })
    .catch(handleError);
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
navigator.mediaDevices.getUserMedia({ audio: false, video: true }).then(function()
{
        supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
        console.log(`CLIENT : Local supported constraints -> `, supportedConstraints);

        navigator.mediaDevices.enumerateDevices().then(populateDeviceList);
})
.catch(handleError);

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