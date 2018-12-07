/**
  * TODO: Add file description
  */

'use strict';

// Button elements
const connectButton = document.querySelector('button#connect');
const disconnectButton = document.querySelector('button#disconnect');

connectButton.onclick = connect;
disconnectButton.onclick = disconnect;

// WebRTC features & elements
var peerConn;
var dataChannel;

var supportedConstraints;
var videoDevices = [];
var remoteVideoDiv = document.querySelector('div#videoFeeds');
var remoteVideoCanvas = document.querySelector('video#loopback');

var localStream;
var localImageCapture;

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