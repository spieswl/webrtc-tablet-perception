'use strict';

// Special constants and variables
var iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
var effScreenWidth = Math.round(window.screen.width * window.devicePixelRatio);
var effScreenHeight = Math.round(window.screen.height * window.devicePixelRatio);
var targetFrequency = 10;
var targetPhaseShift = 0;
var targetDirection = 0;
var patternInterval;
var frequencyArray = [ 1, 2, 5, 10, 20, 50, 100 ];
var sequenceCounter = 0;

// Button elements
const connectButton = document.querySelector('button#connect');
const requestSequenceButton = document.querySelector('button#requestSequence');
const requestConfigButton = document.querySelector('button#requestConfig');
const applyConfigButton = document.querySelector('button#applyConfig');
const showPatternButton = document.querySelector('button#showPattern');

connectButton.onclick = connect;
requestSequenceButton.onclick = requestSequenceFromRemote;
requestConfigButton.onclick = requestConfigFromRemote;
applyConfigButton.onclick = applyConfigToRemote;
showPatternButton.onclick = function()
{
    enterFullscreenState();
    initPattern();
}

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
const torchSelector = document.getElementsByName('torchCtrl');

// WebRTC features & elements
var supportedDevices = [];
var supportedConstraints;

var localImageCapture;
var localStream;
var localConstraints;
var localSettings;
var localCapabilities;
var remoteStream;
var remoteConstraints;
var remoteSettings;
var remoteCapabilities;

var imageSendCount = 0;
var imageRcvCount = 0;

// Typical constraints (to start)
var standardConstraints = 
{
    audio: false,
    video: 
    {
        deviceId:               "",

        width:                  {   min: 320,   ideal: 640,     max: 1920   },
        height:                 {   min: 240,   ideal: 480,     max: 1080   },
        frameRate:              {   min: 0,     ideal: 30,      max: 60     },

        facingMode:             {   ideal: "user"   }
    }
};

// Displayed page elements
var remoteVideoCanvas = document.querySelector('video#inFeed');
var remoteImgs = document.querySelector('div#remoteImages');
var pattern;
var overlay;

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
var socket = io();

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
    signalingMessageCallback(message);
});

socket.on('image_request', function()
{
    console.log('CLIENT: Received request to send latest image. Sending now...');
    sendImage();
});

socket.on('sequence_request', function()
{
    console.log('CLIENT: Received request to start capture sequence. Starting capture sequence now...');
    patternInterval = setInterval(cyclePattern, 6000);
});

socket.on('settings_request', function()
{
    console.log('CLIENT: Received request to transmit constraint, setting, and capability data for active user media track. Transmitting now...');

    socket.emit('settings_response', supportedConstraints, localSettings, localCapabilities);
});

socket.on('apply_request', function(settings)
{
    console.log('CLIENT: Received request to apply the packaged settings for the active user media track.');

    applyNewConstraints(settings);
});

socket.on('settings_response', function(constraints, settings, capabilities)
{
    console.log('CLIENT: Updating local controls with capabilities and settings used by remote client user media track.');

    remoteConstraints = constraints;
    remoteSettings = settings;
    remoteCapabilities = capabilities;

    updateWithRemoteSettings(remoteConstraints, remoteSettings, remoteCapabilities);
});

socket.on('apply_response', function(boolean)
{
    if (boolean === true)   { console.log('CLIENT: Remote client user media track settings successfully updated!'); }
    else                    { console.log('CLIENT: Remote client unable to update user media track with requested settings!'); }
});

socket.on('disconnect', function(reason)
{
    console.log(`CLIENT: Disconnected -> ${reason}.`);
    connectButton.disabled = false;
    requestSequenceButton.disabled = true;
    requestConfigButton.disabled = true;
    applyConfigButton.disabled = true;
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

socket.on('log', function(array)
{
    console.log.apply(console, array);
});

function signalingMessageCallback(message)
/**
  * TODO: Add function description.
  */
{
    if (message.type === 'offer')
    {
        var desc = new RTCSessionDescription(message);

        connect();

        peerConn.setRemoteDescription(desc);
        peerConn.createAnswer(onLocalSessionCreated, handleError);
    }
    else if (message.type === 'answer')
    {
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
//  TODO: Add function description.
{
    connectButton.disabled = true;
    createPeerConnection(isInitiator, configuration);
}

function startVideo()
//  TODO: Add function description.
{
    navigator.mediaDevices.getUserMedia(standardConstraints).then(gotStream).catch(handleError);
}

function stopVideo()
//  TODO: Add function description.
{
    localStream.getTracks().forEach(track => { track.stop(); });
}

function populateDeviceList(devices)
/**
  * TODO: Add function description.
  */
{
    for (let k = 0; k !== devices.length; ++k)
    {
        if (devices[k].kind === 'videoinput')   { supportedDevices.push(devices[k].deviceId); }
    }

    // Update normal constraints with deviceID after the initial query
    standardConstraints.video.deviceId = supportedDevices[0];
}

function gotStream(stream)
/**
  * TODO: Add function description.
  */
{
    localStream = stream;

    var localVideo = document.createElement('video');
    localVideo.srcObject = localStream;
    localVideo.addEventListener('loadedmetadata', (e) =>
    {
        window.setTimeout(() => (getLocalFeedback(localStream)), 500);
    });

    localImageCapture = new ImageCapture(localStream.getVideoTracks()[0]);

    return localStream;
}

function requestSequenceFromRemote()
/**
  * TODO: Add function description.
  */
{
    socket.emit('sequence_request');
}

function requestConfigFromRemote()
/**
  * TODO: Add function description.
  */
{
    socket.emit('settings_request');
}

function sendImage()
/**
  * TODO: Add function description.
  */
{
    localImageCapture.grabFrame().then(imageBitmap =>
    {
        // Local canvas for temporary image storage
        var canvas = document.createElement('canvas');
        canvas.width = 640;    // imageBitmap.width;
        canvas.height = 480;    // imageBitmap.height;
        canvas.getContext('2d').drawImage(imageBitmap, 0, 0, 640, 480);

        // Split data channel message in chunks of this byte length.
        var CHUNK_LEN = 64000;
        var img = canvas.getContext('2d').getImageData(0, 0, 640, 480);
        var len = img.data.byteLength;
        var n = len / CHUNK_LEN | 0;

        console.log('CLIENT: Sending a total of ' + len + ' byte(s) for image # ' + imageSendCount);
    
        if (!dataChannel)
        {
            handleError('ERROR: Connection has not been initiated. Get two peers in the same room first!');
            return;
        }
        else if (dataChannel.readyState === 'closed')
        {
            handleError('ERROR: Connection was lost. Peer closed the connection.');
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
/**
  * TODO: Add function description.
  */
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
    newImgLink.download = "cam1_image" + imageRcvCount + ".png";
    newImgLink.click();

    // Update the global image counter (refreshes on load)
    imageRcvCount++;
}

function getLocalFeedback(stream)
/**
  * TODO: Add function description.
  */
{
    let track = stream.getVideoTracks()[0];

    localConstraints = track.getConstraints();
    console.log(`CLIENT: Current track constraints ->`, localConstraints);

    localSettings = track.getSettings();
    console.log(`CLIENT: Current track settings ->`, localSettings);

    // This code handles converting MediaSettingsRange objects into normal objects, so they can be transferred over the Socket.io connection without being mangled.
    localCapabilities = {};
    let tempCapabilitiesObj = Object.entries(track.getCapabilities());
    for (var k = 0; k < tempCapabilitiesObj.length; k++)
    {
        var tempValue = {};
        var tempName = tempCapabilitiesObj[k][0].toString();

        if (tempCapabilitiesObj[k][1].toString() === '[object MediaSettingsRange]')
        {
            tempValue = Object.assign({max: tempCapabilitiesObj[k][1].max, min: tempCapabilitiesObj[k][1].min, step: tempCapabilitiesObj[k][1].step}, tempValue);
        }
        else if (tempCapabilitiesObj[k][1].toString() === '[object Object]')
        {
            tempValue = Object.assign({max: tempCapabilitiesObj[k][1].max, min: tempCapabilitiesObj[k][1].min}, tempValue);
        }
        else
        {
            tempValue = tempCapabilitiesObj[k][1];
        }

        localCapabilities = Object.assign({[tempName]: tempValue}, localCapabilities);
    }
    console.log(`CLIENT: Current track capabilities ->`, localCapabilities);
}

function updateWithRemoteSettings(constraints, settings, capabilities)
/**
  * TODO: Add function description.
  */
{
    // Using settings and capabilities to modify on-page controls - not all controls are supported!!!
    // You may add and remove these, as necessary. Make sure you update the constraints being passed
    // to track.applyConstraints() in order to reflect the added (or removed) controls.

    /* ------------------------ EXPOSURE CONTROL MODE ----------------------- */
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
        console.log('CLIENT: Exposure control is not supported by remote client.');
    }

    /* -------------------- EXPOSURE COMPENSATION SETTING ------------------- */
    if ('exposureCompensation' in capabilities)
    {
        expCompSlider.min = capabilities.exposureCompensation.min;
        expCompSlider.max = capabilities.exposureCompensation.max;
        expCompSlider.step = capabilities.exposureCompensation.step;
        expCompSlider.value = settings.exposureCompensation;
        expCompValue.innerHTML = expCompSlider.value;

        expCompSlider.oninput = function(event) { expCompValue.innerHTML = event.target.value; }

        expCompSlider.disabled = false;
    }
    else
    {
        expCompSlider.value = 0;
        console.log('CLIENT: Exposure compensation adjustment is not supported by remote client.');
    }

    /* ----------------------- EXPOSURE TIME SETTING ------------------------ */
    if ('exposureTime' in capabilities)
    {
        expTimeSlider.min = capabilities.exposureTime.min;
        expTimeSlider.max = capabilities.exposureTime.max;
        expTimeSlider.step = capabilities.exposureTime.step;
        expTimeSlider.value = settings.exposureTime;
        expTimeValue.innerHTML = expTimeSlider.value;

        expTimeSlider.oninput = function(event) { expTimeValue.innerHTML = event.target.value; }

        expTimeSlider.disabled = false;
    }
    else
    {
        expTimeSlider.value = 0;
        console.log('CLIENT: Exposure time adjustment is not supported by remote client.');
    }

    /* ----------------------------- ISO SETTING ---------------------------- */
    if ('iso' in capabilities)
    {
        isoSlider.min = capabilities.iso.min;
        isoSlider.max = capabilities.iso.max;
        isoSlider.step = 100;
        isoSlider.value = settings.iso;
        isoValue.innerHTML = isoSlider.value;

        isoSlider.oninput = function(event) { isoValue.innerHTML = event.target.value; }

        isoSlider.disabled = false;
    }
    else
    {
        isoSlider.value = 0;
        console.log('CLIENT: ISO adjustment is not supported by remote client.');
    }

    /* ----------------------- FOCUS CONTROL SELECTION ---------------------- */
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
        console.log('CLIENT: Focus control is not supported by remote client.');
    }

    /* ----------------------- FOCUS DISTANCE SETTING ----------------------- */
    if ('focusDistance' in capabilities)
    {
        focusSlider.min = capabilities.focusDistance.min;
        focusSlider.max = capabilities.focusDistance.max;
        focusSlider.step = capabilities.focusDistance.step;
        focusSlider.value = settings.focusDistance;
        focusValue.innerHTML = focusSlider.value;

        focusSlider.oninput = function(event) { focusValue.innerHTML = event.target.value; }

        focusSlider.disabled = false;
    }
    else
    {
        focusSlider.value = 0;
        console.log('CLIENT: Focal distance adjustment is not supported by remote client.');
    }

    /* --------------------- WHITE BALANCE CONTROL MODE --------------------- */
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
        console.log('CLIENT: White balance control is not supported by remote client.');
    }

    /* --------------------- COLOR TEMPERATURE SETTING ---------------------- */
    if ('colorTemperature' in capabilities)
    {
        colorTempSlider.min = capabilities.colorTemperature.min;
        colorTempSlider.max = capabilities.colorTemperature.max;
        colorTempSlider.step = capabilities.colorTemperature.step;
        colorTempSlider.value = settings.colorTemperature;
        colorTempValue.innerHTML = colorTempSlider.value;

        colorTempSlider.oninput = function(event) { colorTempValue.innerHTML = event.target.value; }

        colorTempSlider.disabled = false;
    }
    else
    {
        colorTempSlider.value = 0;
        console.log('CLIENT: Color temperature adjustment is not supported by remote client.');
    }

    /* ---------------------------- ZOOM SETTING ---------------------------- */
    if ('zoom' in capabilities)
    {
        zoomSlider.min = capabilities.zoom.min;
        zoomSlider.max = capabilities.zoom.max;
        zoomSlider.step = capabilities.zoom.step;
        zoomSlider.value = settings.zoom;
        zoomValue.innerHTML = zoomSlider.value;

        zoomSlider.oninput = function(event) { zoomValue.innerHTML = event.target.value; }

        zoomSlider.disabled = false;
    }
    else
    {
        zoomSlider.value = 0;
        console.log('CLIENT: Zoom is not supported by remote client.');
    }

    /* ---------------------------- TORCH SETTING --------------------------- */
    if ('torch' in capabilities)
    {
        if      (settings.torch === false)  { torchSelector[0].checked = true; }
        else if (settings.torch === true)   { torchSelector[1].checked = true; }

        for (var k = 0; k < torchSelector.length; k++)
        {
            torchSelector[k].disabled = false;
        }
    }
    else
    {
        console.log('CLIENT: Torch control is not supported by remote client.');
    }

    applyConfigButton.disabled = false;
}

function applyConfigToRemote()
/**
  * TODO: Add function description.
  */
{
    let newSettings = assembleNewConfigForRemote();

    console.log('CLIENT: Applying new configuration based on remote request ->', newSettings);

    socket.emit('apply_request', newSettings);
}

function assembleNewConfigForRemote()
/**
  * TODO: Add function description.
  */
{
    let newConstraints = { advanced: [{}] };

    // Conditionals to check the status of the radio buttons before plugging them into the constraints applicator.
    /* ------------ EXPOSURE CONTROL, COMPENSATION, TIME SETTINGS ----------- */
    if (document.getElementsByName('expCtrl')[0].checked)
    {
        newConstraints.advanced[0].exposureMode = "continuous";
    }
    else if (document.getElementsByName('expCtrl')[1].checked)
    {
        newConstraints.advanced[0].exposureMode = "manual";
        newConstraints.advanced[0].exposureCompensation = expCompSlider.value;
    }

    /* ----------------------------- ISO SETTING ---------------------------- */
    if (isoSlider.disabled === false)
    {
        newConstraints.advanced[0].iso = isoSlider.value;
    }

    /* ------------------ FOCUS CONTROL, DISTANCE SETTINGS ------------------ */
    if (document.getElementsByName('focusCtrl')[0].checked)
    {
        newConstraints.advanced[0].focusMode = "continuous";
    }
    else if (document.getElementsByName('focusCtrl')[1].checked)
    {
        newConstraints.advanced[0].focusMode = "single-shot";
    }
    else if (document.getElementsByName('focusCtrl')[2].checked)
    {
        newConstraints.advanced[0].focusMode = "manual";
        newConstraints.advanced[0].focusDistance = focusSlider.value;
    }

    /* -------------- WHITE BALANCE, COLOR TEMPERATURE SETTINGS ------------- */
    if (document.getElementsByName('whtBalCtrl')[0].checked)
    {
        newConstraints.advanced[0].whiteBalanceMode = "continuous";
    }
    else if (document.getElementsByName('whtBalCtrl')[1].checked)
    {
        newConstraints.advanced[0].whiteBalanceMode = "manual";
        newConstraints.advanced[0].colorTemperature = colorTempSlider.value;
    }

    /* ---------------------------- ZOOM SETTING ---------------------------- */
    if (zoomSlider.disabled === false)
    {
        newConstraints.advanced[0].zoom = zoomSlider.value;
    }

    /* --------------------------- TORCH CONTROLS --------------------------- */
    if (document.getElementsByName('torchCtrl')[0].checked)
    {
        newConstraints.advanced[0].torch = "false";
    }
    else if (document.getElementsByName('torchCtrl')[1].checked)
    {
        newConstraints.advanced[0].torch = "true";
    }

    return newConstraints;
}

function applyNewConstraints(constraints)
/**
  * TODO: Add function description.
  */
{
    let track = localStream.getVideoTracks()[0];

    track.applyConstraints(constraints).then(function()
    {
        console.log('CLIENT: Newly applied constraints -> ', constraints);

        getLocalFeedback(localStream);

        socket.emit('apply_response', true);
    })
    .catch(function(error)
    {
        handleError(error)
        socket.emit('apply_response', false);
    });
}

//////////////////////////// DEFLECTOMETRY FUNCTIONS ///////////////////////////

function initPattern()
/**
  * TODO: Add function description.
  */
{
    // Overlay setup
    overlay = document.createElement('div');
    overlay.setAttribute("id", "overlay");
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; height: 100%; width: 100%; z-index:100;';

    // Pattern setup
    pattern = document.createElement('canvas');
    pattern.width = effScreenWidth;
    pattern.height = effScreenHeight;
    pattern.style.cssText = 'max-width: none; max-height: none';

    // Add a listener to escape the FullScreen status (requires an overlay w/ pattern to work properly)
    pattern.addEventListener("click", function()
    {
        var cleaner = document.querySelector("div#overlay");
        cleaner.parentNode.removeChild(cleaner);
        
        exitFullScreenState();

        clearInterval(patternInterval);

        targetPhaseShift = 0;
        targetFrequency = 0;
        sequenceCounter = 0;
        imageSendCount = 0;
    });

    // Start out with a dummy pattern for placement and alignment purposes, locked to 10 cycles
    var patCtx = pattern.getContext('2d');
    var patData = generateVerticalPattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, 10, targetPhaseShift);
    patCtx.putImageData(patData, 0, 0);

    overlay.appendChild(pattern);

    document.body.appendChild(overlay);
}

function showPattern(direction, frequency,  phaseShift)
/**
  * TODO: Add function description.
  */
{
    var patCtx = pattern.getContext('2d');
    var patData;
    
    if      (direction === 0)   { patData = generateVerticalPattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, frequency, phaseShift); }
    else if (direction === 1)   { patData = generateHorizontalPattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, frequency, phaseShift); }
    else                        { patData = generateBlackPattern(patCtx, effScreenWidth, effScreenHeight); }

    patCtx.putImageData(patData, 0, 0);
}

function cyclePattern()
/**
  * TODO: Add function description.
  */
{
    targetFrequency = frequencyArray[sequenceCounter];

    showPattern(targetDirection, targetFrequency, targetPhaseShift);

    targetPhaseShift += (Math.PI / 2);

    setTimeout(function()
    {
        sendImage();

        imageSendCount++;

        if (imageSendCount === 4)                               // End of capture sequence for a particular frequency
        {
            imageSendCount = 0;
            targetPhaseShift = 0;
            sequenceCounter++;

            if (sequenceCounter === frequencyArray.length)      // End of capture sequence for all frequencies
            {
                clearInterval(patternInterval);
                setTimeout(function() { showPattern(2, 0, 0); }, 500);
            }
        }
    }, 1000);
}

function generateVerticalPattern(context, width, height, ratio, frequency, phaseShift)
/**
  * TODO: Add function description.
  */
{
    var patternData = context.createImageData(width, height);
    var value = 0;

    for (var i = 0; i < (width * 4); i += 4)
    {
        value = ((127.5 * Math.sin((2 * Math.PI * frequency * i * ratio / (width * 4)) + phaseShift)) + 127.5);
        
        for (var k = 0; k < height; k += 1)
        {
            patternData.data[(4*k*width)+i+0] = value;
            patternData.data[(4*k*width)+i+1] = value;
            patternData.data[(4*k*width)+i+2] = value;
            patternData.data[(4*k*width)+i+3] = 255;
        }
    }

    return patternData;
}

function generateHorizontalPattern(context, width, height, ratio, frequency, phaseShift)
/**
  * TODO: Add function description.
  */
{
    var patternData = context.createImageData(width, height);
    var value = 0;

    for (var k = 0; k < height; k += 1)
    {
        value = ((127.5 * Math.sin((2 * Math.PI * frequency * k * ratio / height) + phaseShift)) + 127.5);

        for (var i = 0; i < (width * 4); i += 4)
        {
            patternData.data[(4*k*width)+i+0] = value;
            patternData.data[(4*k*width)+i+1] = value;
            patternData.data[(4*k*width)+i+2] = value;
            patternData.data[(4*k*width)+i+3] = 255;
        }
    }

    return patternData;
}

function generateBlackPattern(context, width, height)
/**
  * TODO: Add function description.
  */
{
    var patternData = context.createImageData(width, height);

    for (var i = 0; i < (width * height * 4); i += 4)
    {
        patternData.data[i+0] = 0;
        patternData.data[i+1] = 0;
        patternData.data[i+2] = 0;
        patternData.data[i+3] = 255;
    }

    return patternData;
}

function generateWhitePattern(context, width, height)
/**
  * TODO: Add function description.
  */
{
    var patternData = context.createImageData(width, height);

    for (var i = 0; i < (width * height * 4); i += 4)
    {
        patternData.data[i+0] = 255;
        patternData.data[i+1] = 255;
        patternData.data[i+2] = 255;
        patternData.data[i+3] = 255;
    }

    return patternData;
}


function enterFullscreenState()
/**
  * TODO: Add function description.
  */
{
    if      (document.documentElement.requestFullScreen)            { document.documentElement.requestFullScreen(); }
    else if (document.documentElement.mozRequestFullScreen)         { document.documentElement.mozRequestFullScreen(); }
    else if (document.documentElement.webkitRequestFullScreen)      { document.documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT); }
}

function exitFullScreenState()
/**
  * TODO: Add function description.
  */
{
    if      (document.cancelFullScreen)         { document.cancelFullScreen(); }
    else if (document.msCancelFullScreen)       { document.msCancelFullScreen(); }
    else if (document.mozCancelFullScreen)      { document.mozCancelFullScreen(); }
    else if (document.webkitCancelFullScreen)   { document.webkitCancelFullScreen(); }
}

/////////////////////////////// UTILITY FUNCTIONS //////////////////////////////

function randomToken()
/**
  * TODO: Add function description.
  */
{
    return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
}

function handleError(error)
/**
  * TODO: Add function description.
  */
{
    if (typeof error === 'string')
    {
        console.log(error);
    }
    else
    {
        const message = `CLIENT: Error ->  ${error.name} : ${error.message}`;

        alert(message);
        console.log(message);
    }
}

//////////////////////// \/ INITIALIZER BEGINS HERE \/ /////////////////////////

// Initial gUM scan
navigator.mediaDevices.getUserMedia({ audio: false, video: true }).then(function()
{
    supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
    console.log(`CLIENT : Local supported constraints -> `, supportedConstraints);

    navigator.mediaDevices.enumerateDevices().then(populateDeviceList).then(function()
    {
        startVideo();
    });
})
.catch(handleError);

socket.emit('create or join', room);

window.addEventListener('unload', function()
{
    console.log(`CLIENT: Unloading window. Notifying peers in ${room}.`);
    socket.emit('bye', room);
});