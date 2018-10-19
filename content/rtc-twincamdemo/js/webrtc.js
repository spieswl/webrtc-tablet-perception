'use strict';

/////////////////////////////// WEBRTC FUNCTIONS ///////////////////////////////

function createPeerConnection(isInitiator, config)
{
    console.log('CLIENT: Creating Peer connection as initiator?', isInitiator, 'Config?', config);
    peerConn = new RTCPeerConnection(config);

    for (let k = 0; k !== streamList.length; ++k)
    {
        peerConn.addTrack(trackList[k], streamList[k]);
    }

    // Send any ICE candidates to the other peer
    peerConn.onicecandidate = function(event)
    {
        console.log('CLIENT: ICE Candidate event -> ', event);
        if (event.candidate)
        {
            sendMessage(
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
        console.log('CLIENT: Creating Data channel.');
        dataChannel = peerConn.createDataChannel('images');
        onDataChannelCreated(dataChannel);
      
        console.log('CLIENT: Creating an offer.');
        peerConn.createOffer(onLocalSessionCreated, logError);
    }
    else
    {
        peerConn.ondatachannel = function(event)
        {
            console.log('CLIENT: OnDataChannel -> ', event.channel);
            dataChannel = event.channel;
            onDataChannelCreated(dataChannel);
        };
    }

    peerConn.ontrack = function(event)
    {
        if(!remoteVideoCanvas[0].srcObject)
        {
            remoteVideoCanvas[0].srcObject = event.streams[0];
        }
        else if (!remoteVideoCanvas[1].srcObject)
        {
            remoteVideoCanvas[1].srcObject = event.streams[0];
        }
        else return;
    };
}

function onLocalSessionCreated(desc)
{
    console.log('CLIENT: Local session created ->', desc);
    peerConn.setLocalDescription(desc, function()
    {
        console.log('CLIENT: Sending local desc ->', peerConn.localDescription);
        sendMessage(peerConn.localDescription);
    }, logError);
}

function onDataChannelCreated(channel)
{
    console.log('CLIENT: OnDataChannelCreated -> ', channel);

    channel.onopen = function()
    {
        console.log('CLIENT: Data channel opened!');
    };
  
    channel.onclose = function()
    {
        console.log('CLIENT: Data channel closed!');
    }
}