/**
  * This file contains JavaScript which enables application-specific functions in
  * support of "rtc-deflectometry". Math functions, DOM element hooks, global
  * variables, and other things which belong in the "main" function exist in this
  * file. This file is supported by code in 'socket.js', 'webrtc.js', and (if
  * needed), 'constraintControls.js'.
  * 
  * Always check this file first when debugging, and make any application-specific
  * modifications in this file, if necessary and possible to do so.
  */

'use strict';

// Standard constants and variables
var sequenceInterval;
var batchInterval;
var sequenceCounter = 0;
var previewVideoHidden = false;

// Device-specific variables
var effScreenWidth = Math.round(window.screen.width * window.devicePixelRatio);
var effScreenHeight = Math.round(window.screen.height * window.devicePixelRatio);
var localPhotoSettings = 
{ 
    imageHeight:        1080,           // Resolution forced to fit the 
    imageWidth:         1440,           // Shield tablet capabilities
};
var remotePhotoSettings =
{
    imageHeight:        0,
    imageWidth:         0,
};

// Deflectometry-specific variables and elements
var calibInterval;
var calibPixValue = 0;
var frequencyArray = [ 1 ]; //, 2, 2.5, 3, 3.5, 5 ];              // Change this array to introduce other frequencies.
var targetType = 0;
var targetFrequency = 10;
var targetPhaseShift = 0;
var remoteType;
var remoteFrequency;
var remotePhaseShift;
var measurementLineWidth = 10;                              // Change this integer to modify the size of the lines (NOT fringes) projected in the measurement process.
var pattern;
var overlay;
var lensHousingOffset = 100;                                // Change (or comment out the value assignment for) this integer to adjust the black bar size on the left of the Shield tablet.

var localTypeArray = [];
var localFreqArray = [];
var localPhaseArray = [];

// Button elements
const connectButton = document.querySelector('button#connect');
const readyButton = document.querySelector('button#ready');
const requestCalibButton = document.querySelector('button#requestCalib');
const requestSequenceButton = document.querySelector('button#requestSequence');
const testImageButton = document.querySelector('button#testImage');
const requestConfigButton = document.querySelector('button#requestConfig');
const applyConfigButton = document.querySelector('button#applyConfig');
const showFringePatternButton = document.querySelector('button#showFringePattern');
const showLinePatternButton = document.querySelector('button#showLinePattern');
const showWhiteButton = document.querySelector('button#showWhiteImage');
const toggleVideoButton = document.querySelector('button#toggleVideo');

connectButton.onclick = connect;
readyButton.onclick = emitReady;
requestCalibButton.onclick = requestCalibrationFromRemote;
requestSequenceButton.onclick = requestSequenceFromRemote;
testImageButton.onclick = requestImageFromRemote;
requestConfigButton.onclick = requestConfigFromRemote;
applyConfigButton.onclick = applyConfigToRemote;
showFringePatternButton.onclick = function()
{
    enterFullscreenState();
    initPattern(0);
}
showLinePatternButton.onclick = function()
{
    enterFullscreenState();
    initPattern(1);
}
showWhiteButton.onclick = function()
{
    enterFullscreenState();
    initPattern(2);
}
toggleVideoButton.onclick = toggleVideoState;

// WebRTC features & elements
var localImgs = document.querySelector('div#localImages');                      // May not be needed when 'aiortc' is implemented

var remoteVideoDiv = document.querySelector('div#remoteVideo');                 // May not be needed when 'aiortc' is implemented
var remoteVideoCanvas = document.querySelector('video#inFeed');                 // May not be needed when 'aiortc' is implemented
var remoteImgs = document.querySelector('div#remoteImages');                    // May not be needed when 'aiortc' is implemented

var supportedConstraints;
var videoDevices = [];

var localImageCapture;
var localStream;
var localConstraints;
var localSettings;
var localCapabilities;
var remoteStream;                       // May not be needed when 'aiortc' is implemented
var remoteConstraints;                  // May not be needed when 'aiortc' is implemented
var remoteSettings;                     // May not be needed when 'aiortc' is implemented
var remoteCapabilities;                 // May not be needed when 'aiortc' is implemented

var imageSendCount = 0;
var imageCapCount = 0;
var imageRcvCount = 0;                  // May not be needed when 'aiortc' is implemented

// Resolved constraints
var resolvedConstraints = 
{
    video: { deviceId: "" }
};


///////////////////////////// STANDARD FUNCTIONS ///////////////////////////////

function initialize()
/**
  * First function to run when the browser executes JavaScript code in the window.
  * 
  * This calls getUserMedia() so we can interact with and fetch information about
  * device constraints and capabilities, send a video stream to the other client,
  * etc.
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

function connect()
//  Simple function, tied to a button element, that initiates a WebRTC peer connection.
{
    connectButton.disabled = true;

    createPeerConnection(isInitiator, configuration);
}

function stopVideo()
//  Simple function, that can be tied to a button element, that stops all video tracks used
//  by the client.
//
//  Not currently used.
{
    localStream.getTracks().forEach(track => { track.stop(); });
}

function gotStream(stream)
/**
  * Internal function for handling the Promised stream returned by getUserMedia().
  * 
  * Assignment for ImageCapture and other video- or photo-consuming elements needs to 
  * be done after getting the video track from getUserMedia().
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
//  Function tied to a button that asks the other device (typically the measuring device)
//  via Socket.IO for a set of calibration images.
{
    socket.emit('calib_request');
}

function requestSequenceFromRemote()
//  Function tied to a button that asks the other device (typically the measuring device)
//  via Socket.IO to start the measurement process, which is setup in another function.
{
    socket.emit('sequence_request');
}

function requestImageFromRemote()
//  Function tied to a button that asks the other device (typically the measuring device)
//  via Socket.IO to call sendImage() and transfer the resulting image to the host device.
{
    socket.emit('image_request');
}

function requestConfigFromRemote()
//  Function tied to a button that asks the other device (typically the measuring device)
//  via Socket.IO to query the device's capabilities, settings, and applied constraints.
//  It then transfers them across the Socket.IO interface.
{
    socket.emit('settings_request');
}

function captureImage()
/**
  * NOTE: SPECIAL FUNCTION REQUESTED BY FLORIAN W. FOR FREE-HAND DEFLECTOMETRY MEASUREMENTS!
  */
{
    localImageCapture.takePhoto(localPhotoSettings).then(imgBlob =>
    {
        // Generate an image from the blob
        var tempImage = document.createElement('img');
        tempImage.src = URL.createObjectURL(imgBlob);

        tempImage.onload = function()
        {
            var canvas = document.createElement('canvas');
            canvas.width = localPhotoSettings.imageWidth;
            canvas.height = localPhotoSettings.imageHeight;
            canvas.getContext('2d').drawImage(tempImage, 0, 0, canvas.width, canvas.height);

            localImgs.insertBefore(canvas, localImgs.firstChild);
        }
    })
    .catch(err => console.error('CLIENT: takePhoto() error ->', err));
}

function sendImage(index)
// WARNING! THIS FUNCTION HAS BEEN MODIFIED TO SUPPORT FREE-HAND DEFLECTOMETRY MEASUREMENT.
{
    // Send image metadata via Socket.IO connection before sending the image
    socket.emit('sequence_data', localTypeArray[index], localFreqArray[index], index);
    socket.emit('photo_dimensions', localPhotoSettings.imageWidth, localPhotoSettings.imageHeight);
        
    // Split data channel message in chunks of this byte length.
    var bytesSent = 0;
    var chunkLength = 64000;
    var sendDelay = 50;
    var sendInterval = 0;
    
    var canvas = localImgs.getElementsByTagName('canvas')[index];
    var img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    var len = img.data.byteLength;

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
    
    console.log('CLIENT: Sending a total of ' + len + ' byte(s) for image # ' + imageSendCount);
    dataChannel.send(len);

    sendInterval = setInterval(function()
    {
        var msgStart = bytesSent;
        var msgEnd = bytesSent + chunkLength;
        
        if (msgEnd > len)
        {
            msgEnd = len;
            console.log('CLIENT: Last ' + len % chunkLength + ' byte(s) in queue.');
            clearInterval(sendInterval);
        }
        else 
        {
            console.log('CLIENT: Sending bytes ' + msgStart + ' - ' + (msgEnd - 1));
        }

        dataChannel.send(img.data.subarray(msgStart, msgEnd));
        bytesSent = msgEnd;
    }, sendDelay);

    imageSendCount++;
}

function transferImageBatch()
/**
  * NOTE: SPECIAL FUNCTION REQUESTED BY FLORIAN W. FOR FREE-HAND MEASUREMENTS!
  */
{
    imageSendCount = 0;
    var batchLength = localImgs.getElementsByTagName('canvas').length;

    batchInterval = setInterval(function()
    {
        if (imageSendCount <= batchLength)
        {
            console.log('CLIENT: Sending image ' + imageSendCount + ' of ' + batchLength + ' to host device.');
            sendImage(imageSendCount);
        }
        else
        {
            console.log('CLIENT: Ending image batch transfer...');
            clearInterval(batchInterval);
        }
    }, 10000);
}

function renderIncomingPhoto(data)
/**
  * Whenever a full image is received on the RTCDataChannel, this function is called to
  * take the image data and convert it into a an image that can be downloaded by the host
  * client.
  * 
  * The incoming image also gets appended to the remoteImages div on the client's webpage.
  */
{
    // NOTE: DEFLECTOMETRY-SPECIFIC!!!
    analyzeImageBrightness(data);

    // Populating the Remote Image div
    var canvas = document.createElement('canvas');
    canvas.width = remotePhotoSettings.imageWidth;
    canvas.height = remotePhotoSettings.imageHeight;
    remoteImgs.insertBefore(canvas, remoteImgs.firstChild);
    
    var context = canvas.getContext('2d');
    var img = context.createImageData(canvas.width, canvas.height);
    img.data.set(data);
    context.putImageData(img, 0, 0);

    // Saving the image
    let latestImg = remoteImgs.getElementsByTagName('canvas')[0];
    let dataURL = latestImg.toDataURL('image/png').replace("image/png", "image/octet-stream");

    let newImgLink = document.createElement('a');
    newImgLink.href = dataURL;
    newImgLink.download = remoteType + "_f" + remoteFrequency + "_ps" + remotePhaseShift + "_img" + imageRcvCount + ".png";
    newImgLink.click();

    // Update the global image counter (refreshes on load)
    imageRcvCount++;
}

function analyzeImageBrightness(data)
//  Simple function to do some byte-wise comparison of image data coming from a measurement
//  device. As the data is passed over in RGBA format, we check the first three channels
//  for the respective color information, and display that in the local browser's console.
{
    var pxLength = data.length / 4;
    var hiR = 0, locR = 0;
    var hiG = 0, locG = 0;
    var hiB = 0, locB = 0;

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

    console.log(`IMAGE ANALYSIS: Highest R = ${hiR} @ pixel ${locR}.`);
    console.log(`IMAGE ANALYSIS: Highest G = ${hiG} @ pixel ${locG}.`);
    console.log(`IMAGE ANALYSIS: Highest B = ${hiB} @ pixel ${locB}.`);
}

function getStreamFeedback(stream)
/**
  * Calling this function sets a number of global variables to the respetive client that
  * carry information about the local device's constraints, settings, and capabilities.
  * 
  * This information is critical to inform the local user or remote device what is
  * possible involving the video/audio devices here on the local device. Additionally,
  * this is how the maximum image resolution for a particular camera is discovered (min
  * and max values from the height and width variables can be accessed).
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
//  Function tied to a button that asks the other device (typically the measuring device)
//  via Socket.IO to immediately apply a set of constraints to that device's active video
//  track.
{
    let newSettings = assembleNewConfigForRemote();

    console.log('CLIENT: Applying new configuration based on remote request ->', newSettings);

    socket.emit('apply_request', newSettings);
}

function applyNewConstraintsFromRemote(constraints)
//  This function responds to a request received on the Socket.IO interface to apply the
//  included constraints object. The newly constrained device will report back with the
//  results of the constraining procedure.
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
//  Function tied to a button that signals to the other device(s) it is available for
//  establishing a connection via RTCPeerConnection.
{
    socket.emit('ready');
}

function toggleVideoState()
//  Function tied to a button that hides the remote video preview element on the
//  local webpage.
{
    previewVideoHidden = !previewVideoHidden;

    if (previewVideoHidden) { remoteVideoDiv.style.display = "none"; }
    else                    { remoteVideoDiv.style.display = "block"; }
}

function enterFullscreenState()
//  Function tied to a button that requests the browser be placed into fullscreen mode.
{
    if      (document.documentElement.requestFullScreen)            { document.documentElement.requestFullScreen(); }
    else if (document.documentElement.mozRequestFullScreen)         { document.documentElement.mozRequestFullScreen(); }
    else if (document.documentElement.webkitRequestFullScreen)      { document.documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT); }
}

function exitFullScreenState()
//  Function tied to a button that requests the browser exit fullscreen mode and return
//  to its normal display configuration.
{
    if      (document.cancelFullScreen)         { document.cancelFullScreen(); }
    else if (document.msCancelFullScreen)       { document.msCancelFullScreen(); }
    else if (document.mozCancelFullScreen)      { document.mozCancelFullScreen(); }
    else if (document.webkitCancelFullScreen)   { document.webkitCancelFullScreen(); }
}

//////////////////////////// DEFLECTOMETRY FUNCTIONS ///////////////////////////

function initPattern(patSwitch)
/**
  * Before showing any custom, full-white, or full-black pattern, the (now) full-screen
  * browser must have a new canvas element that sits over top of the normally displayed
  * webpage. This canvas is created and destroyed as full-screen is enabled and disabled,
  * so that the website remains usable.
  * 
  * patSwitch allows the calling entity to decide what kind of pattern is to be displayed
  * when the full-screen canvas element is initialized. Regardless of pattern being
  * displayed, calibration or measurement sequences can be called at any time.
  * 
  * This and showPattern() definitely have some overlap that can be refactored into something
  * more modular and clean.
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

        targetType = 0;
        targetPhaseShift = 0;
        targetFrequency = 0;
        sequenceCounter = 0;
        imageSendCount = 0;

        localTypeArray = [];
        localFreqArray = [];
        localPhaseArray = [];
    });

    var patCtx;
    var patData;

    if (patSwitch === 1)
    {
        // Display a vertical line pattern
        patCtx = pattern.getContext('2d');
        patData = generateVerticalLinePattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, 2, Math.PI);
    }
    else if (patSwitch === 2)
    {
        // Display a white pattern
        patCtx = pattern.getContext('2d');
        patData = generateWhitePattern(patCtx, effScreenWidth, effScreenHeight);
    }
    else if (patSwitch === 3)
    {
        // Display a black pattern
        patCtx = pattern.getContext('2d');
        patData = generateBlackPattern(patCtx, effScreenWidth, effScreenHeight);
    }
    else
    {
        // Normal operation is to start out with a dummy fringe pattern for placement and alignment purposes, locked to 10 cycles
        patCtx = pattern.getContext('2d');
        patData = generateVerticalFringePattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, 10, targetPhaseShift);
    }

    patCtx.putImageData(patData, 0, 0);
    overlay.appendChild(pattern);
    document.body.appendChild(overlay);
}

function showPattern(type, frequency, phaseShift)
/**
  * Conditional display function. Pattern is a global variable that corresponds to
  * the full-screen element that will display the requested pattern with the specified
  * characteristics.
  */
{
    var patCtx = pattern.getContext('2d');
    var patData;
    
    if      (type === 0)    { patData = generateVerticalFringePattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, frequency, phaseShift); }
    else if (type === 1)    { patData = generateHorizontalFringePattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, frequency, phaseShift); }
    else if (type === 2)    { patData = generateVerticalLinePattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, frequency, phaseShift); }
    else if (type === 3)    { patData = generateHorizontalLinePattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, frequency, phaseShift); }
    else if (type === 98)   { patData = generateCalibPattern(patCtx, effScreenWidth, effScreenHeight); }
    else                    { patData = generateBlackPattern(patCtx, effScreenWidth, effScreenHeight); }

    patCtx.putImageData(patData, 0, 0);
}

function cyclePattern()
// WARNING! THIS FUNCTION HAS BEEN MODIFIED TO SUPPORT FREE-HAND DEFLECTOMETRY MEASUREMENT.
{
    targetFrequency = frequencyArray[sequenceCounter];

    showPattern(targetType, targetFrequency, targetPhaseShift);

    targetPhaseShift += (Math.PI / 2);

    setTimeout(function()
    {
        captureImage();
        
        localTypeArray.unshift(targetType);
        localFreqArray.unshift(targetFrequency);
        localPhaseArray.unshift(targetPhaseShift);
        imageCapCount++;

        if (imageCapCount === 4)                               // End of capture sequence for a particular frequency
        {
            imageCapCount = 0;
            targetPhaseShift = 0;

            sequenceCounter++;
            if (sequenceCounter === frequencyArray.length)      // End of capture sequence for all frequencies in a particular type group
            {
                sequenceCounter = 0;
                targetType++;

                if (targetType === 2)                           // End of capture sequence for all fringe types
                {
                    targetType = 0;
                    clearInterval(sequenceInterval);
                    setTimeout(function() { showPattern(99, 0, 0); }, 2000);

                    console.log('TYPE : ', localTypeArray);
                    console.log('FREQ : ', localFreqArray);
                    console.log('PHASE : ', localPhaseArray);

                    transferImageBatch();
                }
            }
        }
    }, 100);
}

function generateVerticalFringePattern(context, width, height, ratio, frequency, phaseShift)
/**
  * Deflectometry-specific vertical (when viewed in landscape mode) fringe synthesis
  * function. This returns an pattern that has continuous, sinusoidal shape that is displayed
  * (and shifted) in order to measure the surface normals of an object under test.
  * Several parameters can be changed, either through the function call, or through
  * global variables, to change the data returned by this function.
  * 
  * NOTE: lensHousingOffset MUST exist to avoid any uncaught exceptions when this function
  * triggers, but the conditional will not fire if the value isn't set (or explicitly
  * assigned to NULL).
  * 
  * ALSO NOTE: Vertical and horizontal ranges are different due to the addressing scheme
  * for changing pixel data values on a color display.
  */
{
    var hStart = 0;
    var vStart = 0;
    var patternData = generateBlackPattern(context, width, height);
    var value = 0;

    if (lensHousingOffset)
    {
        hStart = lensHousingOffset * 4;
    }

    for (var i = hStart; i < (width * 4); i += 4)
    {
        value = ((127.5 * Math.sin((2 * Math.PI * frequency * i * ratio / (width * 4)) + phaseShift)) + 127.5);
        
        for (var k = vStart; k < height; k += 1)
        {
            patternData.data[(4*k*width)+i+0] = value;
            patternData.data[(4*k*width)+i+1] = value;
            patternData.data[(4*k*width)+i+2] = value;
            patternData.data[(4*k*width)+i+3] = 255;
        }
    }

    return patternData;
}

function generateHorizontalFringePattern(context, width, height, ratio, frequency, phaseShift)
/**
  * Deflectometry-specific horizontal (when viewed in landscape mode) fringe synthesis
  * function. This returns an pattern that has continuous, sinusoidal shape that is displayed
  * (and shifted) in order to measure the surface normals of an object under test.
  * Several parameters can be changed, either through the function call, or through
  * global variables, to change the data returned by this function.
  * 
  * NOTE: lensHousingOffset MUST exist to avoid any uncaught exceptions when this function
  * triggers, but the conditional will not fire if the value isn't set (or explicitly
  * assigned to NULL).
  * 
  * ALSO NOTE: Vertical and horizontal ranges are different due to the addressing scheme
  * for changing pixel data values on a color display.
  */
{
    var hStart = 0;
    var vStart = 0;
    var patternData = generateBlackPattern(context, width, height);
    var value = 0;

    if (lensHousingOffset)
    {
        hStart = lensHousingOffset * 4;
    }

    for (var k = vStart; k < height; k += 1)
    {
        value = ((127.5 * Math.sin((2 * Math.PI * frequency * k * ratio / width) + phaseShift)) + 127.5);

        for (var i = hStart; i < (width * 4); i += 4)
        {
            patternData.data[(4*k*width)+i+0] = value;
            patternData.data[(4*k*width)+i+1] = value;
            patternData.data[(4*k*width)+i+2] = value;
            patternData.data[(4*k*width)+i+3] = 255;
        }
    }

    return patternData;
}

function generateVerticalLinePattern(context, width, height, ratio, frequency, phaseShift)
/**
  * Deflectometry-specific vertical (when viewed in landscape mode) line synthesis function.
  * This returns an object that is displayed (and shifted) in order to measure the surface
  * normals of an object under test. Several parameters can be changed, either through the
  * function call, or through global variables, to change the data returned by this function.
  * 
  * NOTE: lensHousingOffset MUST exist to avoid any uncaught exceptions when this function
  * triggers, but the conditional will not fire if the value isn't set (or explicitly
  * assigned to NULL).
  * 
  * ALSO NOTE: Vertical and horizontal ranges are different due to the addressing scheme
  * for changing pixel data values on a color display.
  */
{
    var hStart = 0;
    var vStart = 0;
    var lineSpan = width / (frequency * ratio);
    var patternData = generateBlackPattern(context, width, height);

    if (lensHousingOffset)
    {
        hStart = lensHousingOffset * 4;
    }

    for (var count = 0; count < frequency; ++count)
    {
        var linePos = Math.round((count * lineSpan) + ((phaseShift / (2 * Math.PI)) * lineSpan));

        var lineStart = linePos * 4;
        var lineEnd = lineStart + (4 * measurementLineWidth);

        if (lineStart < hStart)
        {
            continue;
        }
        else
        {
            for (var i = lineStart; i < lineEnd; i += 4)
            {
                for (var k = vStart; k < height; ++k)
                {
                    patternData.data[(4*k*width)+i+0] = 255;
                    patternData.data[(4*k*width)+i+1] = 255;
                    patternData.data[(4*k*width)+i+2] = 255;
                    patternData.data[(4*k*width)+i+3] = 255;
                }
            }
        }
    }

    return patternData;
}

function generateHorizontalLinePattern(context, width, height, ratio, frequency, phaseShift)
/**
  * Deflectometry-specific horizontal (when viewed in landscape mode) line synthesis function.
  * This returns an object that is displayed (and shifted) in order to measure the surface
  * normals of an object under test. Several parameters can be changed, either through the
  * function call, or through global variables, to change the data returned by this function.
  * 
  * NOTE: lensHousingOffset MUST exist to avoid any uncaught exceptions when this function
  * triggers, but the conditional will not fire if the value isn't set (or explicitly
  * assigned to NULL).
  * 
  * ALSO NOTE: Vertical and horizontal ranges are different due to the addressing scheme
  * for changing pixel data values on a color display.
  */
{
    var vStart = 0;
    var lineSpan = height / (frequency * ratio);
    var patternData = generateBlackPattern(context, width, height);

    if (lensHousingOffset)
    {
        vStart = lensHousingOffset * 4;
    }

    for (var count = 0; count < frequency; ++count)
    {
        var linePos = Math.round((count * lineSpan) + ((phaseShift / (2 * Math.PI)) * lineSpan));

        var lineStart = linePos;
        var lineEnd = lineStart + (measurementLineWidth);

        for (var i = lineStart; i < lineEnd; ++i)
        {
            for (var k = vStart; k < (width * 4); k += 4)
            {
                patternData.data[(4*i*width)+k+0] = 255;
                patternData.data[(4*i*width)+k+1] = 255;
                patternData.data[(4*i*width)+k+2] = 255;
                patternData.data[(4*i*width)+k+3] = 255;
            }
        }
    }

    return patternData;
}

function generateBlackPattern(context, width, height)
/**
  * Deflectometry-specific full black screen generation function. This returns an object
  * that has can be used in the deflectometry calibration sequence or as a part of a
  * customized measurement sequence.
  * 
  * NOTE: lensHousingOffset MUST exist to avoid any uncaught exceptions when this function
  * triggers, but the conditional will not fire if the value isn't set (or explicitly
  * assigned to NULL).
  * 
  * ALSO NOTE: Vertical and horizontal ranges are different due to the addressing scheme
  * for changing pixel data values on a color display.
  */
{
    var hStart = 0;
    var vStart = 0;
    var patternData = context.createImageData(width, height);

    // NOTE: No lens housing compensation code, always creating a totally black screen.

    for (var i = hStart; i < (width * 4); i += 4)
    {
        for (var k = vStart; k < height; k += 1)
        {
            patternData.data[(4*k*width)+i+0] = 0;
            patternData.data[(4*k*width)+i+1] = 0;
            patternData.data[(4*k*width)+i+2] = 0;
            patternData.data[(4*k*width)+i+3] = 255;
        }
    }

    return patternData;
}

function generateWhitePattern(context, width, height)
/**
  * Deflectometry-specific full white screen generation function. This returns an object
  * that has can be used in the deflectometry calibration sequence or as a part of a
  * customized measurement sequence.
  * 
  * NOTE: lensHousingOffset MUST exist to avoid any uncaught exceptions when this function
  * triggers, but the conditional will not fire if the value isn't set (or explicitly
  * assigned to NULL).
  * 
  * ALSO NOTE: Vertical and horizontal ranges are different due to the addressing scheme
  * for changing pixel data values on a color display.
  */
{
    var hStart = 0;
    var vStart = 0;
    var patternData = generateBlackPattern(context, width, height);

    if (lensHousingOffset)
    {
        hStart = lensHousingOffset * 4;
    }

    for (var i = hStart; i < (width * 4); i += 4)
    {
        for (var k = vStart; k < height; k += 1)
        {
            patternData.data[(4*k*width)+i+0] = 255;
            patternData.data[(4*k*width)+i+1] = 255;
            patternData.data[(4*k*width)+i+2] = 255;
            patternData.data[(4*k*width)+i+3] = 255;
        }
    }

    return patternData;
}

function cycleCalibration()
/**
  * This function is a variation on the measurement sequence that instead shows the
  * calibration pattern. The calibration pattern values will update inside the
  * generateCalibPattern() function, so all that is required is to check for when
  * the calibration sequence is complete.
  */
{
    showPattern(98, 0, 0);

    setTimeout(function()
    {
        socket.emit('sequence_data', 98, 0, imageSendCount);

        sendImage();
        imageSendCount++;

        if (calibPixValue === 255)      // End of capture condition for the calibration sequence.
        {
            imageSendCount = 0;
            calibPixValue = 0;

            clearInterval(calibInterval);
            setTimeout(function() { showPattern(99, 0, 0); }, 500);
        }
    }, 1000);
}

function generateCalibPattern(context, width, height)
/**
  * Deflectometry-specific calibration pattern generation function. This returns an object
  * that has specific relevance to the deflectometry calibration sequence.
  * 
  * NOTE: lensHousingOffset MUST exist to avoid any uncaught exceptions when this function
  * triggers, but the conditional will not fire if the value isn't set (or explicitly
  * assigned to NULL).
  * 
  * ALSO NOTE: Vertical and horizontal ranges are different due to the addressing scheme
  * for changing pixel data values on a color display.
  */
{
    var hStart = 0;
    var vStart = 0;
    var patternData = generateBlackPattern(context, width, height);

    if (lensHousingOffset)
    {
        hStart = lensHousingOffset * 4;
    }

    for (var i = hStart; i < (width * 4); i += 4)
    {
        for (var k = vStart; k < height; k += 1)
        {
            patternData.data[(4*k*width)+i+0] = calibPixValue;
            patternData.data[(4*k*width)+i+1] = calibPixValue;
            patternData.data[(4*k*width)+i+2] = calibPixValue;
            patternData.data[(4*k*width)+i+3] = 255;
        }
    }

    if (calibPixValue === 0)    { calibPixValue += 15; }
    else                        { calibPixValue += 16; }

    if (calibPixValue > 255)    { calibPixValue = 255; }

    return patternData;
}



/////////////////////////////// UTILITY FUNCTIONS //////////////////////////////

function handleError(error)
//  This function is a simple error handler. It has not been exhaustively tested, but
//  it works for the limited number of cases that have come up.
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
