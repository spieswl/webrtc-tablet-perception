'use strict';

// Special constants and variables
var iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

var phaseShift = 0;
var patternInterval;

// Button elements
const cyclePatternButton = document.querySelector('button#cyclePattern');
cyclePatternButton.onclick = function()
{
    enterFullscreenState();
    initPattern();
    patternInterval = setInterval(cyclePattern, 2000);
}

// Displayed page elements
var pattern;
var overlay;

// System-specific constants
var effScreenWidth = Math.round(window.screen.width * window.devicePixelRatio);
var effScreenHeight = Math.round(window.screen.height * window.devicePixelRatio);


///////////////////////////// STANDARD FUNCTIONS ///////////////////////////////

function initPattern()
/**
  * TODO: Add function description.
  */
{
    // Overlay setup
    overlay = document.createElement('div');
    overlay.setAttribute("id", "overlay");
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; height: 100%; width: 100%; z-index:100;';

    // Pattern setup
    pattern = document.createElement('canvas');
    pattern.width = effScreenWidth;
    pattern.height = effScreenHeight;
    pattern.style.cssText = 'max-width: none; max-height: none';

    // Add a listener to escape the FullScreen status (requires an overlay w/ pattern to work properly)
    pattern.addEventListener("click", function()
    {
        var cleaner = document.querySelector("div#overlay");
        cleaner.parentNode.removeChild(cleaner);
        
        exitFullScreenState();

        clearInterval(patternInterval);
    });

    // Start out with a blank pattern
    var patCtx = pattern.getContext('2d');
    var patData = generateBlankPattern(patCtx, effScreenWidth, effScreenHeight);
    patCtx.putImageData(patData, 0, 0);

    overlay.appendChild(pattern);

    document.body.appendChild(overlay);
}

function cyclePattern()
/**
  * TODO: Add function description.
  */
{
    showPattern(0, 10, phaseShift);

    phaseShift += (Math.PI / 2);
}

function showPattern(direction, frequency,  phaseShift)
/**
  * TODO: Add function description.
  */
{
    var patCtx = pattern.getContext('2d');
    var patData;
    
    if      (direction === 0)   { patData = generateVerticalPattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, frequency, phaseShift); }
    else if (direction === 1)   { patData = generateHorizontalPattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, frequency, phaseShift); }
    else                        { patData = generateBlankPattern(patCtx, effScreenWidth, effScreenHeight); }

    patCtx.putImageData(patData, 0, 0);
}

function generateVerticalPattern(context, width, height, ratio, freq, phaseShift)
/**
  * TODO: Add function description.
  */
{
    var patternData = context.createImageData(width, height);
    var value = 0;

    for (var i = 0; i < (width * 4); i += 4)
    {
        for (var k = 0; k < height; k += 1)
        {
            value = ((127.5 * Math.sin((2 * Math.PI * freq * i * ratio / (width * 4)) + phaseShift)) + 127.5);

            patternData.data[(4*k*width)+i+0] = value;
            patternData.data[(4*k*width)+i+1] = value;
            patternData.data[(4*k*width)+i+2] = value;
            patternData.data[(4*k*width)+i+3] = 255;
        }
    }

    return patternData;
}

function generateHorizontalPattern(context, width, height, ratio, freq, phaseShift)
/**
  * TODO: Add function description.
  */
{
    var patternData = context.createImageData(width, height);
    var value = 0;

    for (var k = 0; k < height; k += 1)
    {
        value = ((127.5 * Math.sin((2 * Math.PI * freq * k * ratio / height) + phaseShift)) + 127.5);

        for (var i = 0; i < (width * 4); i += 4)
        {
            patternData.data[(4*k*width)+i+0] = value;
            patternData.data[(4*k*width)+i+1] = value;
            patternData.data[(4*k*width)+i+2] = value;
            patternData.data[(4*k*width)+i+3] = 255;
        }
    }

    return patternData;
}

function generateBlankPattern(context, width, height)
/**
  * TODO: Add function description.
  */
{
    var patternData = context.createImageData(width, height);

    for (var i = 0; i < (width * height * 4); i += 4)
    {
        patternData.data[i+0] = 0;
        patternData.data[i+1] = 0;
        patternData.data[i+2] = 0;
        patternData.data[i+3] = 255;
    }

    return patternData;
}

function enterFullscreenState()
/**
  * TODO: Add function description.
  */
{
    if      (document.documentElement.requestFullScreen)            { document.documentElement.requestFullScreen(); }
    else if (document.documentElement.mozRequestFullScreen)         { document.documentElement.mozRequestFullScreen(); }
    else if (document.documentElement.webkitRequestFullScreen)      { document.documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT); }
}

function exitFullScreenState()
/**
  * TODO: Add function description.
  */
{
    if      (document.cancelFullScreen)         { document.cancelFullScreen(); }
    else if (document.msCancelFullScreen)       { document.msCancelFullScreen(); }
    else if (document.mozCancelFullScreen)      { document.mozCancelFullScreen(); }
    else if (document.webkitCancelFullScreen)   { document.webkitCancelFullScreen(); }
}

////////////////////////////////////////////////////////////////////////////////

alert('Screen Width : ' + window.screen.width);
alert('Screen Height : ' + window.screen.height);
alert('Inner Width : ' + window.innerWidth);
alert('Inner Height : ' + window.innerHeight);
alert('Device Pixel Ratio : ' + devicePixelRatio);
alert('Effective Screen Width : ' + effScreenWidth);
alert('Effective Screen Height : ' + effScreenHeight);