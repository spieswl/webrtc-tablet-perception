'use strict';

// Button elements
const showPatternButton = document.querySelector('button#showPattern');
showPatternButton.onclick = showPattern;

// Displayed page elements
var overlayDivs = [];

///////////////////////////// STANDARD FUNCTIONS ///////////////////////////////

function showPattern()
/**
  * TODO: Add function description.
  */
{
    var effScreenWidth = window.screen.width * window.devicePixelRatio;
    var effScreenHeight = window.screen.height * window.devicePixelRatio;

    var pattern = document.createElement('canvas');
    pattern.width = effScreenWidth;
    pattern.height = effScreenHeight;
    pattern.style.cssText = 'max-width: none; max-height: none';

    var patCtx = pattern.getContext('2d');
    var patData = generatePeriodicPattern(patCtx, effScreenWidth, effScreenHeight, window.devicePixelRatio, 1, (3 * Math.PI / 2));
    patCtx.putImageData(patData, 0, 0);

    // Add a method to escape the FullScreen call
    pattern.addEventListener("click", function()
    {
        var closer = document.querySelector("div#overlay");
        closer.parentNode.removeChild(closer);

        if (document.cancelFullScreen)              { document.cancelFullScreen(); }
        else if (document.msCancelFullScreen)       { document.msCancelFullScreen(); }
        else if (document.mozCancelFullScreen)      { document.mozCancelFullScreen(); }
        else if (document.webkitCancelFullScreen)   { document.webkitCancelFullScreen(); }
    });

    // Apply the generated pattern to the overlay
    var overlay = document.createElement('div');
    overlay.setAttribute("id", "overlay");
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; height: 100%; width: 100%; z-index:100;';
    overlay.appendChild(pattern);

    document.body.appendChild(overlay);

    if (document.documentElement.requestFullScreen)                 { document.documentElement.requestFullScreen(); }
    else if (document.documentElement.mozRequestFullScreen)         { document.documentElement.mozRequestFullScreen(); }
    else if (document.documentElement.webkitRequestFullScreen)      { document.documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT); }
}

function generatePeriodicPattern(context, width, height, ratio, freq, phaseShift)
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