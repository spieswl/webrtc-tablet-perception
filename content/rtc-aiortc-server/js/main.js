/**
  * TODO: Add file description
  */

'use strict';

// Standard constants and variables
var previewVideoHidden = false;

// Button elements
const connectButton = document.querySelector('button#connect');
const disconnectButton = document.querySelector('button#disconnect');
const toggleVideoButton = document.querySelector('button#toggleVideo');
const showWhiteButton = document.querySelector('button#showWhiteImage');
const showBlackButton = document.querySelector('button#showBlackImage');
const showFringePatternButton = document.querySelector('button#showFringePattern');
const showLinePatternButton = document.querySelector('button#showLinePattern');

connectButton.onclick = connect;
disconnectButton.onclick = disconnect;
toggleVideoButton.onclick = toggleVideoState;
showWhiteButton.onclick = function()
{
    enterFullscreenState();
    initPattern(0);
}
showBlackButton.onclick = function()
{
    enterFullscreenState();
    initPattern(1);
}
showFringePatternButton.onclick = function()
{
    enterFullscreenState();
    initPattern(2);
}
showLinePatternButton.onclick = function()
{
    enterFullscreenState();
    initPattern(4);
}

// WebRTC features & elements
var peerConn;
var dataChannel;

var supportedConstraints;
var videoDevices = [];
var remoteVideoDiv = document.querySelector('div#videoFeeds');
var remoteVideoCanvas = document.querySelector('video#loopback');

var localStream;
var localImageCapture;

// Deflectometry-specific variables and elements
var pattern;
var overlay;
var calibPixValue = 0;
var frequencyArray = [ 1, 2, 2.5, 3, 3.5, 5 ];              // Change this array to introduce other frequencies.
var targetType = 0;
var targetFrequency = 10;
var targetPhaseShift = 0;
var measurementLineWidth = 10;                              // Change this integer to modify the size of the lines (NOT fringes) projected in the measurement process.
var lensHousingOffset = 100;                                // Change (or comment out the value assignment for) this integer to adjust the black bar size on the left of the Shield tablet.

var calibInterval;
var sequenceInterval;
var sequenceCounter = 0;
var imageSendCounter = 0;

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

    // Window shutdown handler
    window.addEventListener('unload', function() { console.log(`CLIENT: Unloading window.`); });
}

function connect()
//  Primary function, tied to a button element, that initiates getUserMedia and then
//  establishes a WebRTC peer connection.
{
    connectButton.disabled = true;

    navigator.mediaDevices.enumerateDevices().then(function(devices)
    {
        for (let k = 0; k !== devices.length; ++k)
        {
            if (devices[k].kind === 'videoinput')   { videoDevices.push(devices[k].deviceId); }
        }
        console.log(`CLIENT : Local video devices -> `, videoDevices);

        // Initial gUM scan
        navigator.mediaDevices.getUserMedia({video: {deviceId: videoDevices[0]}}).then(function(stream)
        {
            // Bind to global variables
            localStream = stream;
            localImageCapture = new ImageCapture(localStream.getVideoTracks()[0]);

            // Create the WebRTC peer connection
            createPeerConnection();

            // Finalize peer connection to server
            negotiatePeerConnection();
        })
        .catch(function(err)
        {
            alert(err);
        });
    });

    disconnectButton.disabled = false;
}

function disconnect()
// Function that severs the RTCPeerConnection after gracefully stopping other parts
// of the system.
{
    disconnectButton.disabled = true;

    // Terminate data channel
    if (dataChannel)    { dataChannel.close(); }

    // Stop local video
    remoteVideoCanvas.srcObject = null;
    peerConn.getSenders().forEach(function(sender) { sender.track.stop(); });

    // Close peer connection
    setTimeout(function() { peerConn.close(); }, 500);

    connectButton.disabled = false;
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

/////////////////////////////// WEBRTC FUNCTIONS ///////////////////////////////

function createPeerConnection()
/**
  * Upon connection request, each client must negotiate their end of the WebRTC peer
  * connection. Additionally, video track information (taken from an active video stream
  * on the client side) needs to be added to the peer connection.
  * 
  * A number of other utility functions are used to facilitate the setup of the peer
  * connection and the data channel interface.
  */
{
    // Build out the peerConnection & dataChannel
    peerConn = new RTCPeerConnection();

    dataChannel = peerConn.createDataChannel('images');
    dataChannel.onopen = function() { console.log('CLIENT: Data channel opened!'); };
    dataChannel.onclose = function() { console.log('CLIENT: Data channel closed!'); };

    // Add the local video track to the peerConnection
    peerConn.addTrack(localStream.getVideoTracks()[0], localStream);

    // Create a handler for when the peer connection gets a video track added to it (remotely)
    peerConn.ontrack = function(event)
    {
        if (!remoteVideoCanvas.srcObject)    { remoteVideoCanvas.srcObject = event.streams[0]; }
    };
}

function negotiatePeerConnection()
/**
  * TODO: Add function description.
  */
{
    return peerConn.createOffer().then(function(offer)
    {
        return peerConn.setLocalDescription(offer);
    })
    .then(function()
    {
        return new Promise(function(resolve)
        {
            if (peerConn.iceGatheringState === 'complete')  { resolve(); }
            else
            {
                function checkState()
                {
                    if (peerConn.iceGatheringState === 'complete')
                    {
                        peerConn.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                }
                peerConn.addEventListener('icegatheringstatechange', checkState);
            }
        });
    })
    .then(function()
    {
        var offer = peerConn.localDescription;

        console.log(offer);

        return fetch('/offer',
        {
            body: JSON.stringify({sdp: offer.sdp, type: offer.type}),
            headers:{'Content-Type': 'application/json'},
            method: 'POST'
        });
    })
    .then(function(response)
    {
        return response.json();
    })
    .then(function(answer)
    {
        return peerConn.setRemoteDescription(answer);
    })
    .catch(function(err)
    {
        alert(err);
    });
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
        imageSendCounter = 0;
    });

    // Selection of pattern to display
    if (patSwitch === 1)
    {
        // Display a black pattern
        showPattern(1, 0, 0);
    }
    else if (patSwitch === 2)
    {
        // Display a vertical fringe pattern, locked to 10 cycles
        showPattern(2, 10, 0);
    }
    else if (patSwitch === 4)
    {
        // Display a vertical line pattern, with 2 lines shifted some amount
        showPattern(4, 2, Math.PI);
    }
    else
    {
        // Display a white pattern
        showPattern(0, 0, 0);
    }
    
    // Posting the pattern to the overlay
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

    if      (type === 1)    { patData = generateBlackPattern(patCtx, effScreenWidth, effScreenHeight); }
    else if (type === 2)    { patData = generateVerticalFringePattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, frequency, phaseShift); }
    else if (type === 3)    { patData = generateHorizontalFringePattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, frequency, phaseShift); }
    else if (type === 4)    { patData = generateVerticalLinePattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, frequency, phaseShift); }
    else if (type === 5)    { patData = generateHorizontalLinePattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, frequency, phaseShift); }
    else if (type === 98)   { patData = generateCalibPattern(patCtx, effScreenWidth, effScreenHeight); }
    else                    { patData = generateWhitePattern(patCtx, effScreenWidth, effScreenHeight); }

    patCtx.putImageData(patData, 0, 0);
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
