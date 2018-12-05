/**
  * WebRTC serves as the backbone for device-to-device video and photographic capture
  * and communication. getUserMedia(), RTCPeerConnection, and RTCDataChannel are all
  * used to implement a device-to-device image capture and relay system in 'webrtc-
  * perception' so changes here are not to be taken lightly.
  * 
  * Reference "adapter.js" for more browser-specific details regarding WebRTC:
  * https://github.com/webrtc/adapter
  */

'use strict';

// WebRTC variables
var peerConn;
var dataChannel;


/////////////////////////////// WEBRTC FUNCTIONS ///////////////////////////////

function createPeerConnection(isInitiator, config)
/**
  * Upon connection request, each client must negotiate their end of the WebRTC peer
  * connection. Additionally, video track information (taken from an active video stream
  * on the client side) needs to be added to the peer connection.
  * 
  * A number of other utility functions are used to facilitate the setup of the peer
  * connection and the data channel interface.
  */
{
    console.log('CLIENT: Creating peer connection as initiator?', isInitiator, 'Config?', config);
    peerConn = new RTCPeerConnection(config);

    peerConn.addTrack(localStream.getVideoTracks()[0], localStream);

    // Send any ICE candidates to the other peer
    peerConn.onicecandidate = function(event)
    {
        if (event.candidate)
        {
            socket.emit('message',
            {
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        }
        else
        {
            console.log('CLIENT: End of candidates.');
        }
    };

    if (isInitiator)
    {
        dataChannel = peerConn.createDataChannel('images');
        onDataChannelCreated(dataChannel);
        peerConn.createOffer(onLocalSessionCreated, handleError);
    }
    else
    {
        peerConn.ondatachannel = function(event)
        {
            dataChannel = event.channel;
            onDataChannelCreated(dataChannel);
        };
    }

    peerConn.ontrack = function(event)
    {
        if(!remoteVideoCanvas.srcObject)
        {
            remoteVideoCanvas.srcObject = remoteStream = event.streams[0];
        }
        else return;
    };
}

function onLocalSessionCreated(desc)
/**
  * The local session "description" contains critical information about the established
  * WebRTC peer connection and is used to synchronize with other clients.
  */
{
    peerConn.setLocalDescription(desc, function() { socket.emit('message', peerConn.localDescription); }, handleError);
}

function onDataChannelCreated(channel)
/**
  * This function is called when the WebRTC data channel is successfully created and
  * allows for simple reconfiguration of website behavior when data can be passed back
  * and forth.
  */
{
    channel.onopen = function()
    {
        console.log('CLIENT: Data channel opened!');
        requestSequenceButton.disabled = false;
        requestConfigButton.disabled = false;
    };
  
    channel.onclose = function()
    {
        console.log('CLIENT: Data channel closed!');
        requestSequenceButton.disabled = true;
        testImageButton.disabled = true;
        requestConfigButton.disabled = true;
    }

    channel.onmessage = (adapter.browserDetails.browser === 'firefox') ? receiveDataFirefoxFactory() : receiveDataChromeFactory();
}

function receiveDataChromeFactory()
/**
  * One particular side effect of using the WebRTC data channel is that browser-specific
  * data handling needs to be defined. This function is called if a client (of no
  * particular browser version) ends up passing data (the onmessage event fires) to another
  * client that is using a Webkit-based browser.
  */
{
    var buf, count;

    return function onmessage(event)
    {
        if (typeof event.data === 'string')
        {
            buf = window.buf = new Uint8ClampedArray(parseInt(event.data));
            count = 0;
            console.log('CLIENT: Expecting a total of ' + buf.byteLength + ' bytes.');
            return;
        }

        var data = new Uint8ClampedArray(event.data);
        buf.set(data, count);

        count += data.byteLength;
        console.log('CLIENT: Byte count -> ' + count);

        if (count === buf.byteLength)
        {
            console.log('CLIENT: Done. Rendering image.');
            renderIncomingPhoto(buf);
        }
    };
}

function receiveDataFirefoxFactory()
/**
  * One particular side effect of using the WebRTC data channel is that browser-specific
  * data handling needs to be defined. This function is called if a client (of no
  * particular browser version) ends up passing data (the onmessage event fires) to another
  * client that is using Mozilla Firefox.
  */
{
    var count, total, parts;

    return function onmessage(event)
    {
        if (typeof event.data === 'string')
        {
            total = parseInt(event.data);
            parts = [];
            count = 0;
            console.log('CLIENT: Expecting a total of ' + total + ' bytes.');
            return;
        }

        parts.push(event.data);
        count += event.data.size;
        console.log('CLIENT: Got ' + event.data.size + ' byte(s), ' + (total - count) + ' to go.');

        if (count === total)
        {
            console.log('CLIENT: Assembling payload');
            var buf = new Uint8ClampedArray(total);
            var compose = function(i, pos)
            {
                var reader = new FileReader();
                reader.onload = function()
                {
                    buf.set(new Uint8ClampedArray(this.result), pos);
                    if (i + 1 === parts.length)
                    {
                        console.log('CLIENT: Done. Rendering image.');
                        renderIncomingPhoto(buf);
                    }
                    else
                    {
                        compose(i + 1, pos + this.result.byteLength);
                    }
                };
                reader.readAsArrayBuffer(parts[i]);
            };
            compose(0, 0);
        }
    };
}