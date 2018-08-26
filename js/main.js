'use strict';

const startVideoButton = document.querySelector('button#startVideo');
const captureImageButton = document.querySelector('button#captureImage');

startVideoButton.onclick = startVideo;
captureImageButton.onclick = captureImage;

const getUserMediaConstraintsDiv = document.querySelector('div#getUserMediaConstraints');
const localVideo = document.querySelector('div#localVideo video');

const initConstraints = { audio: false, video: true };
var videoInputSources = [];
var videoCanvases = [ document.querySelector('#video1'), document.querySelector('#video2') ];

initialize();

////////////////////////////////////////////////////////////////////////////////

function initialize()
{
    navigator.mediaDevices.getUserMedia(initConstraints).catch(handleGumError);
    navigator.mediaDevices.enumerateDevices().then(populateDeviceList).catch(handleGenericError);
    console.log(`CONSOLE : Video sources -> `, videoInputSources);
    displayGetUserMediaConstraints();
}

function populateDeviceList(devices)
{
    for (let k = 0; k !== devices.length; ++k)
    {
        if (devices[k].kind === 'videoinput')   { videoInputSources.push(devices[k].deviceId); }
    }
}

function displayGetUserMediaConstraints()
{
    const constraints = getUserMediaConstraints(0);

    console.log(`CONSOLE: GetUserMedia constraints ->`, constraints);
    getUserMediaConstraintsDiv.textContent = JSON.stringify(constraints, null, '    ');
}

function getUserMediaConstraints(counter)
{
    const constraints = {};

    constraints.audio = false;
    constraints.video =
    {
        deviceId:               videoInputSources[counter],

        width:                  {   min: 640,   ideal: 1280,    max: 1920   },
        height:                 {   min: 480,   ideal: 720,     max: 1080   },
        frameRate:              {               ideal: 60                   },

        whiteBalanceMode:       "manual",
        exposureMode:           "manual",
        focusMode:              "manual",

        exposureCompensation:   {   min: -3.0,                  max: 3.0    },
        /*
        colorTemperature:       {   min: xxxx,                  max: xxxx   },
        iso:                    {   min: 100,                   max: 1600   },
        brightness:             {   min: xxx,                   max: xxx    },
        contrast:               {   min: xxx,                   max: xxx    },
        saturation:             {   min: xxx,                   max: xxx    },
        sharpness:              {   min: xxx,                   max: xxx    },
        focusDistance:          {   min: xxx,                   max: xxx    },
        zoom:                   {   min: xxx,                   max: xxx    },
        */
        torch:                  false
    };

    return constraints;
}

function startVideo()
{
    startVideoButton.disabled = true;

    for (let k = 0; k !== videoInputSources.length; ++k)
    {
        var localStream = navigator.mediaDevices.getUserMedia(getUserMediaConstraints(k)).then(gotStream).catch(handleGumError);

        bindStreamToCanvas(k, localStream);
    }
}

function gotStream(stream)
{
    let localTracks = stream.getVideoTracks();
    console.log(`CONSOLE: localTracks listing -> `, localTracks);

    let trackConstraints = localTracks[0].getCapabilities();
    console.log(`CONSOLE: Track constraints -> `, trackConstraints);

    return stream;
}

function bindStreamToCanvas(counter, stream)
{
    videoCanvases[counter].srcObject = stream;
}

function handleGenericError(error)
{
    console.log(`CONSOLE: Error ->  ${error.name} : ${error.message}`);
}

function handleGumError(error)
{
    const message = `CONSOLE: GetUserMedia Error -> ${error.name}\nPermissionDeniedError may mean invalid constraints.`;

    alert(message);
    console.log(message);
    startVideoButton.disabled = false;
}

////////////////////////////////////////////////////////////////////////////////

function captureImage()
{
    ;
}