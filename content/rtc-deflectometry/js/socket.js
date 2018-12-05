/**
  * In addition to WebRTC, 'webrtc-perception' uses a straightforward messaging
  * channel for some of the non-video- or photo-related capabilities, such as
  * transferring information about device capabilities, relaying measurement data
  * in nicely formatted data structures, and simplifying the process of adding
  * new interactions between remote and host clients.
  * 
  * This code is _mostly_ application-agnostic. Specific measurement techniques
  * may require additional interactions, such as requesting a device calibration,
  * so be sure to pay attention to this file when migrating fixes or changes from
  * other 'webrtc-perception' applications.
  */

'use strict';

// Establishing a socket connection
var socket = io();

// Networking variables
var configuration = null;
var isInitiator;


////////////////////////////// SOCKET.IO SIGNALS ///////////////////////////////

socket.on('ready', function()
{
    console.log('CLIENT: Other client is signalling that it is ready!');
    isInitiator = true;
    connectButton.disabled = false;
});

socket.on('message', function(message)
{
    signalingMessageCallback(message);
});

socket.on('image_request', function()
{
    console.log('CLIENT: Received request to send a test image. Sending one image now...');
    sendImage();
});

socket.on('calib_request', function()
{
    console.log('CLIENT: Received request to start calibration sequence. Starting calibration sequence now...');
    imageSendCount = 0;
    calibInterval = setInterval(cycleCalibration, 10000);
});

socket.on('sequence_request', function()
{
    console.log('CLIENT: Received request to start capture sequence. Starting capture sequence now...');
    imageSendCount = 0;
    sequenceInterval = setInterval(cyclePattern, 10000);
});

socket.on('settings_request', function()
{
    console.log('CLIENT: Received request to transmit constraint, setting, and capability data for active user media track. Transmitting now...');

    getStreamFeedback(localStream);

    socket.emit('settings_response', supportedConstraints, localSettings, localCapabilities);
});

socket.on('apply_request', function(settings)
{
    console.log('CLIENT: Received request to apply the packaged settings for the active user media track.');

    applyNewConstraintsFromRemote(settings);
});

socket.on('photo_dimensions', function(imageWidth, imageHeight)
{
    console.log('CLIENT: Received photo capture dimensions from measurement device. Updating remotePhotoSettings now...');

    remotePhotoSettings.imageWidth = imageWidth;
    remotePhotoSettings.imageHeight = imageHeight;
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

socket.on('sequence_data', function(sequenceParam1, sequenceParam2, sequenceParam3)
{
    if      (sequenceParam1 === 0)  { remoteType = "VF"; }
    else if (sequenceParam1 === 1)  { remoteType = "HF"; }
    else if (sequenceParam1 === 2)  { remoteType = "VL"; }
    else if (sequenceParam1 === 3)  { remoteType = "HL"; }
    else if (sequenceParam1 === 98) { remoteType = "Cal"; }
    else                            { remoteType = ""; }

    remoteFrequency = sequenceParam2;
    remotePhaseShift = sequenceParam3;
});

socket.on('disconnect', function(reason)
{
    console.log(`CLIENT: Disconnected -> ${reason}.`);
    connectButton.disabled = false;
    requestCalibButton.disabled = true;
    requestSequenceButton.disabled = true;
    testImageButton.disabled = true;
    requestConfigButton.disabled = true;
    applyConfigButton.disabled = true;
});

socket.on('bye', function()
{
    console.log(`CLIENT: Other client is leaving the system.`);
});

function signalingMessageCallback(message)
/**
  * When a client receives a Socket.IO communique of type 'message', particular
  * client behavior is defined by the conditional statement in this function.
  * 
  * The 'message' communique type is reserved, in this implementation, for WebRTC
  * signalling.
  * 
  * This function isn't _strictly_ necessary, as long as the contained code moves to
  * the proper socket callback.
  */
{
    if (message.type === 'offer')
    {
        var desc = new RTCSessionDescription(message);

        isInitiator = false;
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