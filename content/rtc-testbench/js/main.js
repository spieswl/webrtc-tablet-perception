'use strict';

// Button elements
const showPatternButton = document.querySelector('button#cyclePattern');
showPatternButton.onclick = function()
{
    enterFullscreenState();

    showPattern(0, 10, phaseShift);

    setInterval(cyclePattern, 2000);
}

// Displayed page elements
var pattern = document.createElement('canvas');

// System-specific constants
var effScreenWidth = window.screen.width * window.devicePixelRatio;
var effScreenHeight = window.screen.height * window.devicePixelRatio;

// Special constants
var phaseShift = 0;


///////////////////////////// STANDARD FUNCTIONS ///////////////////////////////

function initPattern()
/**
  * TODO: Add function description.
  */
{
    // Pattern setup
    pattern.width = effScreenWidth;
    pattern.height = effScreenHeight;
    pattern.style.cssText = 'max-width: none; max-height: none';

    // Add a listener to escape the FullScreen status (requires an overlay w/ pattern to work properly)
    pattern.addEventListener("click", function()
    {
        var cleaner = document.querySelector("div#overlay");
        cleaner.parentNode.removeChild(cleaner);

        exitFullScreenState();
    });
}

function cyclePattern()
/**
  * TODO: Add function description.
  */
{
    phaseShift += (Math.PI / 2);

    var cleaner = document.querySelector("div#overlay");
    cleaner.removeChild(cleaner.firstChild);

    showPattern(0, 10, phaseShift);
}

function showPattern(direction, frequency,  phaseShift)
/**
  * TODO: Add function description.
  */
{
    var patCtx = pattern.getContext('2d');
    var patData;
    
    if      (direction === 0)   { patData = generateVerticalPattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, 10, 0); }
    else if (direction === 1)   { patData = generateHorizontalPattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, 10, 0); }
    else                        { patData = patCtx.createImageData(effScreenWidth, effScreenHeight); }  // BLANK CANVAS

    patCtx.putImageData(patData, 0, 0);

    // Apply the newly generated pattern, this assumes the overlay is going to be empty.
    var overlay = document.createElement('div');
    overlay.setAttribute("id", "overlay");
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; height: 100%; width: 100%; z-index:100;';
    overlay.appendChild(pattern);

    document.body.appendChild(overlay);
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

console.log('Screen Width : ', window.screen.width);
console.log('Screen Height : ', window.screen.height);
console.log('Device Pixel Ratio :', devicePixelRatio);
console.log('Effective Screen Width : ', effScreenWidth);
console.log('Effective Screen Height : ', effScreenHeight);

initPattern();