'use strict';

const startVideoButton = document.querySelector('button#startVideo');
const captureImageButton = document.querySelector('button#captureImage');
const stopVideoButton = document.querySelector('button#stopVideo');
const getConstraintsButton = document.querySelector('button#getConstraints');
const applyConstraintsButton = document.querySelector('button#applyConstraints');

startVideoButton.onclick = startVideo;
captureImageButton.onclick = captureImage;
stopVideoButton.onclick = stopVideo;
getConstraintsButton.onclick = displayConstraints;
applyConstraintsButton.onclick = applyDesiredConstraints;

const initConstraints = { audio: false, video: true };
const cameraFacingOrder = [ "user", "environment" ];

var videoInputSources = [];
var streamList = [];
var trackList = [];
var videoCanvases = [ document.querySelector('video#feed1'), document.querySelector('video#feed2') ];
var imageCanvases = [ document.querySelector('canvas#frame1'), document.querySelector('canvas#frame2') ];
var boundVideoIndex = 0;

initialize();

////////////////////////////////////////////////////////////////////////////////

function initialize()
{
    navigator.mediaDevices.getUserMedia(initConstraints).catch(handleError);
    navigator.mediaDevices.enumerateDevices().then(populateDeviceList).catch(handleError);
    console.log(`CONSOLE : Video sources -> `, videoInputSources);

    let supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
    console.log(`CONSOLE : Supported constraints -> `, supportedConstraints)
}

function populateDeviceList(devices)
{
    for (let k = 0; k !== devices.length; ++k)
    {
        if (devices[k].kind === 'videoinput')   { videoInputSources.push(devices[k].deviceId); }
    }
}

function getStreamConstraints(counter)
{
    const constraints = {};

    constraints.audio = false;
    constraints.video =
    {
        deviceId:               videoInputSources[counter],

        width:                  {   min: 320,   ideal: 1280,    max: 1920   },
        height:                 {   min: 240,   ideal: 720,     max: 1080   },
        frameRate:              {   min: 0,     ideal: 60,      max: 60     },

        facingMode:             {   ideal: cameraFacingOrder[counter]       }
    };

    return constraints;
}

function startVideo()
{
    startVideoButton.disabled = true;

    boundVideoIndex = 0;
    streamList = [];

    for (let k = 0; k !== videoInputSources.length; ++k)
    {
        navigator.mediaDevices.getUserMedia(getStreamConstraints(k)).then(gotStream).then(bindStreamToCanvas).catch(handleError);
    }

    captureImageButton.disabled = false;
    stopVideoButton.disabled = false;
    getConstraintsButton.disabled = false;
}

function stopVideo()
{
    captureImageButton.disabled = true;
    stopVideoButton.disabled = true;
    getConstraintsButton.disabled = true;
    applyConstraintsButton.disabled = true;

    for (let k = 0; k !== streamList.length; ++k)
    {
        streamList[k].getTracks().forEach(track => { track.stop(); });
    }

    startVideoButton.disabled = false;
}

function gotStream(stream)
{
    let localTrack = stream.getVideoTracks()[0];
    console.log(`CONSOLE: Track listing -> `, localTrack);
    
    streamList.push(stream);
    trackList.push(localTrack);

    return stream;
}

function bindStreamToCanvas(stream)
{
    const track = stream.getVideoTracks()[0];
    let feed = videoCanvases[boundVideoIndex];
    feed.srcObject = stream;

    feed.addEventListener('loadedmetadata', (e) => {  
        window.setTimeout(() => (
            onCapabilitiesReady(track)
        ), 500);
      });

    boundVideoIndex++;
}

function onCapabilitiesReady(track) {  
    console.log(`CONSOLE: Track capabilities -> `, track.getCapabilities());
    console.log(`CONSOLE: Track settings -> `, track.getSettings());
}

function handleError(error)
{
    const message = `CONSOLE: Error ->  ${error.name} : ${error.message}`;

    alert(message);
    console.log(message);
    startVideoButton.disabled = false;
}

////////////////////////////////////////////////////////////////////////////////

function captureImage()
{
    for (let k = 0; k !== streamList.length; ++k)
    {
        let settings = trackList[k].getSettings();

        imageCanvases[k].getContext('2d').drawImage(videoCanvases[k], 0, 0, settings.width, settings.height);
    }
}

////////////////////////////////////////////////////////////////////////////////

function displayConstraints()
{
    applyConstraintsButton.disabled = false;
}

function applyDesiredConstraints()
{
    ;
}
