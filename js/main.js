'use strict';

const startVideoButton = document.querySelector('button#startVideo');
const saveImage1Button = document.querySelector('button#saveImage1');
const saveImage2Button = document.querySelector('button#saveImage2');
const stopVideoButton = document.querySelector('button#stopVideo');
const getFeedbackButton = document.querySelector('button#getFeedback');
const applyConstraintsButton = document.querySelector('button#applyConstraints');

startVideoButton.onclick = startVideo;
saveImage1Button.onclick = saveImage1;
saveImage2Button.onclick = saveImage2;
stopVideoButton.onclick = stopVideo;
getFeedbackButton.onclick = displayFeedback;
applyConstraintsButton.onclick = applyDesiredConstraints;

const initConstraints = { audio: false, video: true };
const cameraFacingOrder = [ "user", "environment" ];

var videoInputSources = [];
var streamList = [];
var trackList = [];
var videoCanvases = [ document.querySelector('video#feed1'), document.querySelector('video#feed2') ];
var boundVideoIndex = 0;

var img1Canvas = document.createElement('canvas');
var img1Link = document.createElement('a');
var img2Canvas = document.createElement('canvas');
var img2Link = document.createElement('a');


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

function saveImage1()
{
    var settings = trackList[0].getSettings();

    img1Canvas.setAttribute("height", settings.height);
    img1Canvas.setAttribute("width", settings.width);
    img1Canvas.getContext('2d').drawImage(videoCanvases[0], 0, 0, settings.width, settings.height);

    let dataURL1 = img1Canvas.toDataURL('image/png').replace("image/png", "image/octet-stream");
    
    img1Link.href = dataURL1;
    img1Link.download = "cam1_image.png";
    img1Link.click();
}

function saveImage2()
{
    var settings = trackList[1].getSettings();

    img2Canvas.setAttribute("height", settings.height);
    img2Canvas.setAttribute("width", settings.width);
    img2Canvas.getContext('2d').drawImage(videoCanvases[1], 0, 0, settings.width, settings.height);

    var dataURL2 = img2Canvas.toDataURL('image/png').replace("image/png", "image/octet-stream");

    img2Link.href = dataURL2;
    img2Link.download = "cam2_image.png";
    img2Link.click();
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
