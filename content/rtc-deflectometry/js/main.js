/**
  * TODO: Add file description.
  * 
  * 
  */

'use strict';

// Standard constants and variables
var sequenceInterval;
var sequenceCounter = 0;
var previewVideoHidden = false;

// Device-specific variables
var effScreenWidth = Math.round(window.screen.width * window.devicePixelRatio);
var effScreenHeight = Math.round(window.screen.height * window.devicePixelRatio);

// Deflectometry-specific variables and elements
var calibInterval;
var calibPixValue = 0;
var frequencyArray = [ 1, 2, 2.5, 3, 3.5, 5 ];
var targetDirection = 0;
var targetFrequency = 10;
var targetPhaseShift = 0;
var remoteDirection;
var remoteFrequency;
var remotePhaseShift;
var pattern;
var overlay;

// Button elements
const connectButton = document.querySelector('button#connect');
const readyButton = document.querySelector('button#ready');
const requestCalibButton = document.querySelector('button#requestCalib');
const requestSequenceButton = document.querySelector('button#requestSequence');
const testImageButton = document.querySelector('button#testImage');
const requestConfigButton = document.querySelector('button#requestConfig');
const applyConfigButton = document.querySelector('button#applyConfig');
const showPatternButton = document.querySelector('button#showPattern');
const showWhiteButton = document.querySelector('button#showWhiteImage');
const toggleVideoButton = document.querySelector('button#toggleVideo');

connectButton.onclick = connect;
readyButton.onclick = emitReady;
requestCalibButton.onclick = requestCalibrationFromRemote;
requestSequenceButton.onclick = requestSequenceFromRemote;
testImageButton.onclick = requestImageFromRemote;
requestConfigButton.onclick = requestConfigFromRemote;
applyConfigButton.onclick = applyConfigToRemote;
showPatternButton.onclick = function()
{
    enterFullscreenState();
    initPattern(0);
}
showWhiteButton.onclick = function()
{
    enterFullscreenState();
    initPattern(2);
}
toggleVideoButton.onclick = toggleVideoState;

// WebRTC features & elements
var remoteVideoDiv = document.querySelector('div#remoteVideo');
var remoteVideoCanvas = document.querySelector('video#inFeed');
var localImgs = document.querySelector('div#localImages');
var remoteImgs = document.querySelector('div#remoteImages');

var supportedConstraints;
var videoDevices = [];

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

// Resolved constraints
var resolvedConstraints = 
{
    video: 
    {
        deviceId:   "",

        height:     {exact: 720},
        width:      {exact: 1280}
    }
};


///////////////////////////// STANDARD FUNCTIONS ///////////////////////////////

function initialize()
/**
  * TODO: Add function description.
  */
{
    // Recover constrainable properties supported by the browser
    supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
    console.log(`CLIENT : Local supported constraints -> `, supportedConstraints);

    navigator.mediaDevices.enumerateDevices().then(function(devices)
    {
        for (let k = 0; k !== devices.length; ++k)
        {
            if (devices[k].kind === 'videoinput')   { videoDevices.push(devices[k].deviceId); }
        }
        console.log(`CLIENT : Local video devices -> `, videoDevices);

        // Set the resolved constraints deviceId to one of the two (or more?) enumerated video devices
        resolvedConstraints.video.deviceId = videoDevices[0];

        // Initial gUM scan
        navigator.mediaDevices.getUserMedia(resolvedConstraints).then(gotStream).catch(handleError);

        readyButton.disabled = false;
    });

    window.addEventListener('unload', function()
    {
        console.log(`CLIENT: Unloading window.`);
        socket.emit('bye');
    });
}

/* function recoverMaxVideoResolution(device)
{
    var settings;
    var capabilities;

    navigator.mediaDevices.getUserMedia({video: {deviceId: device}}).then(function(stream)
    {
        settings = stream.getVideoTracks()[0].getSettings();
        capabilities = stream.getVideoTracks()[0].getCapabilities();

        resolvedConstraints.video.deviceId = settings.deviceId;

        if (capabilities.height.max > 720)  { resolvedConstraints.video.height.exact = 720; }
        else                                { resolvedConstraints.video.height.exact = capabilities.height.max; }

        if (capabilities.width.max > 1280)  { resolvedConstraints.video.width.exact = 1280; }
        else                                { resolvedConstraints.video.width.exact = capabilities.width.max; }

        console.log('CLIENT: Resolved constraints after device selection ->', resolvedConstraints);

        stream.getTracks().forEach(track => { track.stop(); });
    })
} */

function connect()
//  TODO: Add function description.
{
    connectButton.disabled = true;

    createPeerConnection(isInitiator, configuration);
}

function stopVideo()
//  TODO: Add function description.
{
    localStream.getTracks().forEach(track => { track.stop(); });
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
        window.setTimeout(() => (getStreamFeedback(localStream)), 500);
    });

    localImageCapture = new ImageCapture(localStream.getVideoTracks()[0]);
}

function requestCalibrationFromRemote()
/**
  * TODO: Add function description.
  */
{
    socket.emit('calib_request');
}

function requestSequenceFromRemote()
/**
  * TODO: Add function description.
  */
{
    socket.emit('sequence_request');
}

function requestImageFromRemote()
/**
  * TODO: Add function description.
  */
{
    socket.emit('image_request');
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
    localImageCapture.takePhoto().then(imgBlob =>
    {
        // Generate an image from the blob
        var tempImage = document.createElement('img');
        localImgs.append(tempImage);
        tempImage.src = URL.createObjectURL(imgBlob);

        tempImage.onload = function()
        {
            console.log(tempImage.width);
            console.log(tempImage.height);
        }

        /* // Local canvas for temporary image storage
        var canvas = document.createElement('canvas');
        canvas.width = tempImage.width;
        canvas.height = tempImage.height;
        canvas.getContext('2d').drawImage(tempImage, 0, 0, tempImage.width, tempImage.height);

        // Split data channel message in chunks of this byte length.
        var CHUNK_LEN = 64000;
        var img = canvas.getContext('2d').getImageData(0, 0, tempImage.width, tempImage.height);
        var len = img.data.byteLength;
        var n = len / CHUNK_LEN | 0;

        console.log('CLIENT: Sending a total of ' + len + ' byte(s) for image # ' + imageSendCount);
    
        if (!dataChannel)
        {
            handleError('ERROR: Connection has not been initiated.!');
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
        } */
    })
    .catch(err => console.error('CLIENT: takePhoto() error ->', err));
}

function renderIncomingPhoto(data)
/**
  * TODO: Add function description.
  */
{
    // DEBUG
    var pxLength = data.length / 4;
    var hiR = 0;
    var locR = 0;
    var hiG = 0;
    var locG = 0;
    var hiB = 0;
    var locB = 0;

    for (var k = 0; k < pxLength; ++k)
    {
        if (data[(4*k)] > hiR)
        { 
            hiR = data[(4*k)];
            locR = k;
        }

        if (data[(4*k)+1] > hiG)
        {
            hiG = data[(4*k)+1];
            locG = k;
        }

        if (data[(4*k)+2] > hiB)
        {
            hiB = data[(4*k)+2];
            locB = k;
        }
    }

    console.log(`Highest R = ${hiR} @ pixel ${locR}.`);
    console.log(`Highest G = ${hiG} @ pixel ${locG}.`);
    console.log(`Highest B = ${hiB} @ pixel ${locB}.`);
    // END DEBUG

    // Populating the Remote Image div
    var canvas = document.createElement('canvas');
    canvas.width = remoteSettings.width;
    canvas.height = remoteSettings.height;
    canvas.classList.add('remoteImages');
    remoteImgs.insertBefore(canvas, remoteImgs.firstChild);
    
    var context = canvas.getContext('2d');
    var img = context.createImageData(remoteSettings.width, remoteSettings.height);
    img.data.set(data);
    context.putImageData(img, 0, 0);

    // Saving the image
    let latestImg = remoteImgs.getElementsByTagName('canvas')[0];
    let dataURL = latestImg.toDataURL('image/png').replace("image/png", "image/octet-stream");

    let newImgLink = document.createElement('a');
    newImgLink.href = dataURL;
    newImgLink.download = remoteDirection + "_f" + remoteFrequency + "_ps" + remotePhaseShift + "_img" + imageRcvCount + ".png";
    newImgLink.click();

    // Update the global image counter (refreshes on load)
    imageRcvCount++;
}

function getStreamFeedback(stream)
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

    return stream;
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

function applyNewConstraintsFromRemote(constraints)
/**
  * TODO: Add function description.
  */
{
    let track = localStream.getVideoTracks()[0];

    track.applyConstraints(constraints).then(function()
    {
        console.log('CLIENT: Newly applied constraints -> ', constraints);

        getStreamFeedback(localStream);

        socket.emit('apply_response', true);
    })
    .catch(function(error)
    {
        handleError(error)
        socket.emit('apply_response', false);
    });
}

function emitReady()
//  TODO: Add function description.
{
    socket.emit('ready');
}

function toggleVideoState()
//  TODO: Add function description.
{
    previewVideoHidden = !previewVideoHidden;

    if (previewVideoHidden) { remoteVideoDiv.style.display = "none"; }
    else                    { remoteVideoDiv.style.display = "block"; }
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

//////////////////////////// DEFLECTOMETRY FUNCTIONS ///////////////////////////

function initPattern(patSwitch)
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

        clearInterval(sequenceInterval);
        clearInterval(calibInterval);

        targetDirection = 0;
        targetPhaseShift = 0;
        targetFrequency = 0;
        sequenceCounter = 0;
        imageSendCount = 0;
    });

    var patCtx;
    var patData;

    if (patSwitch === 1)
    {
        // Display a black pattern
        patCtx = pattern.getContext('2d');
        patData = generateBlackPattern(patCtx, effScreenWidth, effScreenHeight);
    }
    else if (patSwitch === 2)
    {
        // Display a white pattern
        patCtx = pattern.getContext('2d');
        patData = generateWhitePattern(patCtx, effScreenWidth, effScreenHeight);
    }
    else
    {
        // Normal operation is to start out with a dummy pattern for placement and alignment purposes, locked to 10 cycles
        patCtx = pattern.getContext('2d');
        patData = generateVerticalPattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, 10, targetPhaseShift);
    }

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
        socket.emit('sequence_data', targetDirection, targetFrequency, imageSendCount);

        sendImage();
        imageSendCount++;

        if (imageSendCount === 4)                               // End of capture sequence for a particular frequency
        {
            imageSendCount = 0;
            targetPhaseShift = 0;

            sequenceCounter++;
            if (sequenceCounter === frequencyArray.length)      // End of capture sequence for all frequencies in a particular direction
            {
                if (targetDirection === 1)                      // End of capture sequence for both directions
                {
                    targetDirection = 0;
                    clearInterval(sequenceInterval);
                    setTimeout(function() { showPattern(2, 0, 0); }, 500);
                }

                sequenceCounter = 0;
                targetDirection++;
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
        value = ((127.5 * Math.sin((2 * Math.PI * frequency * k * ratio / width) + phaseShift)) + 127.5);

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

function showCalibPattern()
/**
  * TODO: Add function description.
  */
{
    var patCtx = pattern.getContext('2d');
    var patData = generateCalibPattern(patCtx, effScreenWidth, effScreenHeight);
    patCtx.putImageData(patData, 0, 0);
}

function cycleCalibration()
/**
  * TODO: Add function description.
  */
{
    showCalibPattern();

    setTimeout(function()
    {
        socket.emit('sequence_data', 2, 0, imageSendCount);

        sendImage();
        imageSendCount++;

        if (imageSendCount === 16)                              // End of capture sequence for a particular frequency
        {
            imageSendCount = 0;

            clearInterval(calibInterval);
            setTimeout(function() { showPattern(2, 0, 0); }, 500);
        }
    }, 1000);
}

function generateCalibPattern(context, width, height)
/**
  * TODO: Add function description.
  */
{
    var patternData = context.createImageData(width, height);

    for (var i = 0; i < (width * height * 4); i += 4)
    {
        patternData.data[i+0] = calibPixValue;
        patternData.data[i+1] = calibPixValue;
        patternData.data[i+2] = calibPixValue;
        patternData.data[i+3] = 255;
    }

    if (calibPixValue === 0)    { calibPixValue += 15; }
    else                        { calibPixValue += 16; }

    if (calibPixValue > 255)    { calibPixValue = 0; }

    return patternData;
}

/////////////////////////////// UTILITY FUNCTIONS //////////////////////////////

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

initialize();
