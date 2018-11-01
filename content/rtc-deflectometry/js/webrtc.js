'use strict';

/////////////////////////////// WEBRTC FUNCTIONS ///////////////////////////////

function createPeerConnection(isInitiator, config)
/**
  * TODO: Add function description.
  */
{
    console.log('CLIENT: Creating peer connection as initiator?', isInitiator, 'Config?', config);
    peerConn = new RTCPeerConnection(config);

    peerConn.addTrack(localStream.getVideoTracks()[0], localStream);

    // Send any ICE candidates to the other peer
    peerConn.onicecandidate = function(event)
    {
        // (REMOVE COMMENT FOR DEBUG OUTPUT) console.log('CLIENT: ICE Candidate event -> ', event);
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
            // (REMOVE COMMENT FOR DEBUG OUTPUT) console.log('CLIENT: End of candidates.');
        }
    };

    if (isInitiator)
    {
        // (REMOVE COMMENT FOR DEBUG OUTPUT) console.log('CLIENT: Creating Data channel.');
        dataChannel = peerConn.createDataChannel('images');
        onDataChannelCreated(dataChannel);

        // (REMOVE COMMENT FOR DEBUG OUTPUT) console.log('CLIENT: Creating an offer.');
        peerConn.createOffer(onLocalSessionCreated, handleError);
    }
    else
    {
        peerConn.ondatachannel = function(event)
        {
            // (REMOVE COMMENT FOR DEBUG OUTPUT) console.log('CLIENT: OnDataChannel -> ', event.channel);
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
  * TODO: Add function description.
  */
{
    // (REMOVE COMMENT FOR DEBUG OUTPUT) console.log('CLIENT: Local session created ->', desc);
    peerConn.setLocalDescription(desc, function()
    {
        socket.emit('message', peerConn.localDescription);
    }, handleError);
}

function onDataChannelCreated(channel)
/**
  * TODO: Add function description.
  */
{
    // (REMOVE COMMENT FOR DEBUG OUTPUT) console.log('CLIENT: OnDataChannelCreated -> ', channel);

    channel.onopen = function()
    {
        console.log('CLIENT: Data channel opened!');
        requestSequenceButton.disabled = false;
        requestConstraintsButton.disabled = false;
    };
  
    channel.onclose = function()
    {
        console.log('CLIENT: Data channel closed!');
        requestSequenceButton.disabled = true;
        requestConstraintsButton.disabled = true;
    }

    channel.onmessage = (adapter.browserDetails.browser === 'firefox') ? receiveDataFirefoxFactory() : receiveDataChromeFactory();
}

function receiveDataChromeFactory()
/**
  * TODO: Add function description.
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
  * TODO: Add function description.
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