/**
  * This file contains JavaScript which enables application-specific functions in
  * support of "rtc-shapeshifter". Math functions, DOM element hooks, global
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
var sequenceCounter = 0;
var previewVideoHidden = false;

// Device-specific variables
var localPhotoSettings = 
{ 
    imageHeight:        1440,           // Resolution forced to fit the
    imageWidth:         2560,           // capabilities of the OnePlus 3T
};
var remotePhotoSettings =
{
    imageHeight:        0,
    imageWidth:         0,
};

// Shapeshifter-specific variables

// Control elements
const connectButton = document.querySelector('button#connect');
const readyButton = document.querySelector('button#ready');
const requestSequenceButton = document.querySelector('button#requestSequence');
const testImageButton = document.querySelector('button#testImage');
const requestConfigButton = document.querySelector('button#requestConfig');
const applyConfigButton = document.querySelector('button#applyConfig');
const toggleVideoButton = document.querySelector('button#toggleVideo');

connectButton.onclick = connect;
readyButton.onclick = emitReady;
requestSequenceButton.onclick = requestSequenceFromRemote;
testImageButton.onclick = requestImageFromRemote;
requestConfigButton.onclick = requestConfigFromRemote;
applyConfigButton.onclick = applyConfigToRemote;
toggleVideoButton.onclick = toggleVideoState;

// WebRTC features & elements
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
var imageRcvCount = 0;                  // May not be needed when 'aiortc' is implemented

// Resolved constraints
var resolvedConstraints = 
{
    video:  { deviceId: "" }
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
        resolvedConstraints.video.deviceId = videoDevices[1];

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

function sendImage()
/**
  * This function is called whenever images are requested from a remote device or as part
  * of a dedicated capture sequence. Capturing images via the ImageCapture API, repacking
  * them, and sending them across the RTCDataChannel is all combined into this function.
  * 
  * The RTCDataChannel should be an established part of the RTCPeerConnection in order to
  * successfully transmit image data across the connection. Note that these images are
  * intentionally not compressed or sent via other methods to preserve all of the image
  * data.
  */
{
    localImageCapture.takePhoto(localPhotoSettings).then(imgBlob =>
    {
        socket.emit('photo_dimensions', localPhotoSettings.imageWidth, localPhotoSettings.imageHeight);

        // Generate an image from the blob
        var tempImage = document.createElement('img');
        tempImage.src = URL.createObjectURL(imgBlob);

        tempImage.onload = function()
        {
            // Local canvas for temporary storage
            var canvas = document.createElement('canvas');
            canvas.width = localPhotoSettings.imageWidth;
            canvas.height = localPhotoSettings.imageHeight;
            canvas.getContext('2d').drawImage(tempImage, 0, 0, canvas.width, canvas.height);

            // Split data channel message in chunks of this byte length.
            var bytesSent = 0;
            var chunkLength = 64000;
            var sendDelay = 50;
            var intervalID = 0;

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

            intervalID = setInterval(function()
            {
                var msgStart = bytesSent;
                var msgEnd = bytesSent + chunkLength;

                if (msgEnd > len)
                {
                    msgEnd = len;
                    console.log('CLIENT: Last ' + len % chunkLength + ' byte(s) in queue.');
                    clearInterval(intervalID);
                }
                else 
                {
                    console.log('CLIENT: Sending bytes ' + msgStart + ' - ' + (msgEnd - 1));
                }

                dataChannel.send(img.data.subarray(msgStart, msgEnd));
                bytesSent = msgEnd;
            }, sendDelay);
        }
    })
    .catch(err => console.error('CLIENT: takePhoto() error ->', err));
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
    // Populating the Remote Image div
    var canvas = document.createElement('canvas');
    canvas.width = remotePhotoSettings.imageWidth;
    canvas.height = remotePhotoSettings.imageHeight;
    canvas.classList.add('remoteImages');
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
    newImgLink.download = "image" + imageRcvCount + ".png";
    newImgLink.click();

    // Update the global image counter (refreshes on load)
    imageRcvCount++;
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
    let newSettings = assembleNewConfigForRemote(remoteCapabilities);

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

//////////////////////////// SHAPESHIFTER FUNCTIONS ////////////////////////////

function captureSequence()
/**
  * Once a measurement sequence is requested, this function will use the setInterval
  * method to capture and send an image to the host after a period of time (typ. 15 sec.).
  * 
  * Currently, the capture sequence will continue until the website is refreshed, so
  * new functionality still needs to be added to clear 'sequenceInterval'.
  * 
  * Change the integer at the end of setInterval() to adjust how long of a delay exists
  * between successive image captures.
  */
{
    sequenceInterval = setInterval(function()
    {
        sendImage();
    }, 15000);
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