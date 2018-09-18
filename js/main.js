'use strict';

const startVideoButton = document.querySelector('button#startVideo');
const saveImage1Button = document.querySelector('button#saveImage1');
const saveImage2Button = document.querySelector('button#saveImage2');
const stopVideoButton = document.querySelector('button#stopVideo');
const getFeedbackButton = document.querySelector('button#getFeedback');
const applyConstraintsButton = document.querySelector('button#applyConstraints');

startVideoButton.onclick = startVideo;
saveImage1Button.onclick = function () { saveImage(0); };
saveImage2Button.onclick = function () { saveImage(1); };
stopVideoButton.onclick = stopVideo;
getFeedbackButton.onclick = displayFeedback;
applyConstraintsButton.onclick = applyDesiredConstraints;

const initConstraints = { audio: false, video: true };
const cameraFacingOrder = [ "user", "environment" ];

var videoInputSources = [];
var streamList = [];
var trackList = [];
var videoCanvas = [ document.querySelector('video#feed1'), document.querySelector('video#feed2') ];
var imgCanvas = [ document.createElement('canvas'), document.createElement('canvas') ];                 // Blank canvases for saving images from the video feed
var imgLink = [ document.createElement('a'), document.createElement('a') ];                             // Empty links to generate download capabilities
var boundVideoIndex = 0;

var settingsDivs = [ document.querySelector('div#fbSettings1'), document.querySelector('div#fbSettings2') ];
var capabilitiesDivs = [ document.querySelector('div#fbCapabilities1'), document.querySelector('div#fbCapabilities2') ];


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
    trackList = [];

    for (let k = 0; k !== videoInputSources.length; ++k)
    {
        navigator.mediaDevices.getUserMedia(getStreamConstraints(k)).then(gotStream).then(bindStreamToCanvas).catch(handleError);
    }
    
    saveImage1Button.disabled = false;
    saveImage2Button.disabled = false;
    stopVideoButton.disabled = false;
    getFeedbackButton.disabled = false;
}

function stopVideo()
{
    saveImage1Button.disabled = true;
    saveImage2Button.disabled = true;
    stopVideoButton.disabled = true;
    getFeedbackButton.disabled = true;
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
    console.log(`CONSOLE: Track`, boundVideoIndex+1 ,`listing ->`, localTrack);
    
    streamList.push(stream);
    trackList.push(localTrack);

    return stream;
}

function bindStreamToCanvas(stream)
{
    const track = stream.getVideoTracks()[0];
    let feed = videoCanvas[boundVideoIndex];
    feed.srcObject = stream;

    feed.addEventListener('loadedmetadata', (e) => {  
        window.setTimeout(() => (
            onCapabilitiesReady(track)
        ), 500);
    });

    boundVideoIndex++;
}

function onCapabilitiesReady(track) {  
    console.log(`CONSOLE: Track`, boundVideoIndex ,`capabilities ->`, track.getCapabilities());
    console.log(`CONSOLE: Track`, boundVideoIndex ,`settings ->`, track.getSettings());
}

function handleError(error)
{
    const message = `CONSOLE: Error ->  ${error.name} : ${error.message}`;

    alert(message);
    console.log(message);
    startVideoButton.disabled = false;
}

////////////////////////////////////////////////////////////////////////////////

function saveImage(value)
{
    var settings = trackList[value].getSettings();

    imgCanvas[value].setAttribute("height", settings.height);
    imgCanvas[value].setAttribute("width", settings.width);
    imgCanvas[value].getContext('2d').drawImage(videoCanvas[value], 0, 0, settings.width, settings.height);

    let dataURL = imgCanvas[value].toDataURL('image/png').replace("image/png", "image/octet-stream");
    
    imgLink[value].href = dataURL;
    imgLink[value].download = "cam" + String(value) + "_image.png";
    imgLink[value].click();
}

////////////////////////////////////////////////////////////////////////////////

function displayFeedback()
{
    applyConstraintsButton.disabled = false;

    for (let k = 0; k !== streamList.length; ++k)
    {
        let settings = trackList[k].getSettings();
        settingsDivs[k].textContent = JSON.stringify(settings, null, '    ');

        let capabilities = trackList[k].getCapabilities();
        capabilitiesDivs[k].textContent = JSON.stringify(capabilities, null, '    ');
    }
}

function applyDesiredConstraints()
{
    ;
}
