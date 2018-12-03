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
var localPhotoSettings = 
{ 
    fillLightMode:      "off",
    imageHeight:        1440,       // Resolution forced to fit the capabilities of the OnePlus 3T.
    imageWidth:         2560,       // NOTE: Needs to be 16:9
    redEyeReduction:    false 
};
var remotePhotoSettings =
{
    fillLightMode:      "off",
    imageHeight:        0,
    imageWidth:         0,
    redEyeReduction:    false
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
var remoteVideoDiv = document.querySelector('div#remoteVideo');
var remoteVideoCanvas = document.querySelector('video#inFeed');
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
    video:  { deviceId: "" }
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
  * TODO: Add function description.
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