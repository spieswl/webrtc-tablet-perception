/*
 *
 */

'use strict';

const startVideoButton = document.querySelector('button#startVideo');
const captureImageButton = document.querySelector('button#captureImage');

startVideoButton.onclick = startVideo;
captureImageButton.onclick = captureImage;

const getUserMediaConstraintsDiv = document.querySelector('div#getUserMediaConstraints');
const localVideo = document.querySelector('div#localVideo video');

let localStream;

main();

function main() {
    displayGetUserMediaConstraints();
}

////////////////////////////////////////////////////////////////////////////////

function startVideo() {
    startVideoButton.disabled = true;

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      const videoTracks = localStream.getVideoTracks();
      for (let i = 0; i !== videoTracks.length; ++i) {
        videoTracks[i].stop();
      }
    }

    navigator.mediaDevices.getUserMedia(getUserMediaConstraints()).then(gotStream).catch(e => {
            const message = `CONSOLE: GetUserMedia error: ${e.name}\nPermissionDeniedError may mean invalid constraints.`;
            alert(message);
            console.log(message);
            startVideoButton.disabled = false;
        });
}

function captureImage() {
    ;
}

function getUserMediaConstraints() {
    const constraints = {};
    constraints.audio = false;
    constraints.video = {
        
        width:                  {   min: 1024,  ideal: 1280,    max: 1920   },
        height:                 {   min: 776,   ideal: 720,     max: 1080   },
        frameRate:              {               ideal: 60                   },
        /*
        whiteBalanceMode:       "manual",
        exposureMode:           "manual",
        focusMode:              "manual",

        exposureCompensation:   {   min: -3.0,                  max: 3.0    },
        colorTemperature:       {   min: xxxx,                  max: xxxx   },
        iso:                    {   min: 100,                   max: 1600   },
        brightness:             {   min: xxx,                   max: xxx    },
        contrast:               {   min: xxx,                   max: xxx    },
        saturation:             {   min: xxx,                   max: xxx    },
        sharpness:              {   min: xxx,                   max: xxx    },
        focusDistance:          {   min: xxx,                   max: xxx    },
        zoom:                   {   min: xxx,                   max: xxx    },
        torch:                  true
        */
    };

    return constraints;
}

function displayGetUserMediaConstraints() {
    const constraints = getUserMediaConstraints();
    console.log('CONSOLE: GetUserMedia constraints ->', constraints);
    getUserMediaConstraintsDiv.textContent = JSON.stringify(constraints, null, '    ');
}

// Utility to show the value of a range in a sibling span element
function displayRangeValue(e) {
    const span = e.target.parentElement.querySelector('span');
    span.textContent = e.target.value;
    displayGetUserMediaConstraints();
}

function gotStream(stream) {
    console.log('CONSOLE: GetUserMedia succeeded.');
    localStream = stream;
    localVideo.srcObject = stream;
}