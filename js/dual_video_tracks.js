/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

const start_button = document.querySelector('#start');
const initialConstraints = { audio: false, video: true };
var assignmentConstraints = {};
var videoInputSources = [];
var videoCanvases = [ document.querySelector('#video1'), document.querySelector('#video2') ];

start_button.onclick = function() { start_video(); };

function gotStream(stream) {
    window.stream = stream;
    return navigator.mediaDevices.enumerateDevices();
}

function gotDevices(deviceList)
{
    for (let i = 0; i !== deviceList.length; ++i) {
        const deviceInfo = deviceList[i];
        if (deviceInfo.kind === 'videoinput') {
            videoInputSources.push(deviceInfo.deviceId);
            console.log('Video input device: ', deviceInfo);
        } else {
            console.log('Other device: ', deviceInfo);
        }
    }
}

function assignTrackToCanvas(stream)
{
    for (let j = 0; j !== videoCanvases.length; ++j)
    {
        let canvas = videoCanvases[j];
        if (!(canvas.srcObject))
        {
            canvas.srcObject = stream;
            return;
        }
    }
}

function start_video()
{
    if (window.stream) {
        window.stream.getTracks().forEach(track => {
            track.stop();
        });
    }

    for (let k = 0; k !== videoInputSources.length; ++k)
    {
        assignmentConstraints = {
            video: {deviceId: videoInputSources[k]}
        };

        navigator.mediaDevices.getUserMedia(assignmentConstraints).then(assignTrackToCanvas).catch(handleError);
    }
}

function handleError(error) {
    console.log('navigator.getUserMedia error: ', error);
}

navigator.mediaDevices.getUserMedia(initialConstraints).then(gotStream).then(gotDevices).catch(handleError);