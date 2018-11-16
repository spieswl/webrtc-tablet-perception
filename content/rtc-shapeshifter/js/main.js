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
var remoteVideoDiv = document.querySelector('div#remoteVideo');
var remoteVideoCanvas = document.querySelector('video#inFeed');
var remoteImgs = document.querySelector('div#remoteImages');

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

// Resolved constraints
var resolvedConstraints = 
{
    video: 
    {
        deviceId:   videoDevices[1],

        height:     {exact: 720},
        width:      {exact: 1280},
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
    localImageCapture.grabFrame().then(imageBitmap =>
    {
        // Local canvas for temporary image storage
        var canvas = document.createElement('canvas');
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        canvas.getContext('2d').drawImage(imageBitmap, 0, 0, imageBitmap.width, imageBitmap.height);

        // Split data channel message in chunks of this byte length.
        var CHUNK_LEN = 64000;
        var img = canvas.getContext('2d').getImageData(0, 0, imageBitmap.width, imageBitmap.height);
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
    newImgLink.download = "image" + imageRcvCount + ".png";
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
    let newSettings = assembleNewConfigForRemote(remoteCapabilities);

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

//////////////////////////// SHAPESHIFTER FUNCTIONS ////////////////////////////

function captureSequence()
//  TODO: Add function description.
{
    sendImage();
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