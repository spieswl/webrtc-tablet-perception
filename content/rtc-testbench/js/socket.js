/**
  * TODO: Add file description.
  * 
  * 
  */

'use strict';

var socket = io();      // Establishing a socket connection

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

socket.on('disconnect', function(reason)
{
    console.log(`CLIENT: Disconnected -> ${reason}.`);
    connectButton.disabled = false;
});

socket.on('bye', function(room)
{
    console.log(`CLIENT: Other client is leaving the system.`);
});

function signalingMessageCallback(message)
/**
  * TODO: Add function description.
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