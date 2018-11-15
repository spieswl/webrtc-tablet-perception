/**
  * TODO: Add file description.
  * 
  * 
  */

'use strict';

// Settings control elements
/* const widthSlider = document.querySelector('input[name="widthSet"]');
const widthValue = document.querySelector('output[id="widthValue"]'); */

const expSelector = document.getElementsByName('expCtrl');
const expCompSlider = document.querySelector('input[name="expCompSet"]');
const expCompValue = document.querySelector('output[id="expCompValue"]');
const expTimeSlider = document.querySelector('input[name="expTimeSet"]');
const expTimeValue = document.querySelector('output[id="expTimeValue"]');
const isoSlider = document.querySelector('input[name="isoSet"]');
const isoValue = document.querySelector('output[id="isoValue"]');
const focusSelector = document.getElementsByName('focusCtrl');
const focusSlider = document.querySelector('input[name="focusDistSet"]');
const focusValue = document.querySelector('output[id="focusDistValue"]');
const whtBalSelector = document.getElementsByName('whtBalCtrl');
const colorTempSlider = document.querySelector('input[name="colorTempSet"]');
const colorTempValue = document.querySelector('output[id="colorTempValue"]');
const zoomSlider = document.querySelector('input[name="zoomSet"]');
const zoomValue = document.querySelector('output[id="zoomValue"]');
const torchSelector = document.getElementsByName('torchCtrl');


///////////////////////////// CONSTRAINT CONTROLS //////////////////////////////

function updateWithRemoteSettings(constraints, settings, capabilities)
/**
  * TODO: Add function description.
  */
{
    // Using settings and capabilities to modify on-page controls - not all controls are supported!!!
    // You may add and remove these, as necessary. Make sure you update the constraints being passed
    // to track.applyConstraints() in order to reflect the added (or removed) controls.

    /* ---------------------------- VIDEO WIDTH ----------------------------- */
    /* if (settings.width)
    {
        widthSlider.value = settings.width;
        widthValue.innerHTML = widthSlider.value;
        
        widthSlider.oninput = function(event) { widthValue.innerHTML = event.target.value; }
        
        widthSlider.disabled = false;
    } */

    /* ------------------------ EXPOSURE CONTROL MODE ----------------------- */
    if ('exposureMode' in capabilities)
    {
        if      (settings.exposureMode === 'continuous')    { expSelector[0].checked = true; }
        else if (settings.exposureMode === 'manual')        { expSelector[1].checked = true; }

        for (var k = 0; k < expSelector.length; k++)
        {
            expSelector[k].disabled = false;
        }
    }
    else
    {
        console.log('CLIENT: Exposure control is not supported by remote client.');
    }

    /* -------------------- EXPOSURE COMPENSATION SETTING ------------------- */
    if ('exposureCompensation' in capabilities)
    {
        expCompSlider.min = capabilities.exposureCompensation.min;
        expCompSlider.max = capabilities.exposureCompensation.max;
        expCompSlider.step = capabilities.exposureCompensation.step;
        expCompSlider.value = settings.exposureCompensation;
        expCompValue.innerHTML = expCompSlider.value;

        expCompSlider.oninput = function(event) { expCompValue.innerHTML = event.target.value; }

        expCompSlider.disabled = false;
    }
    else
    {
        expCompSlider.value = 0;
        console.log('CLIENT: Exposure compensation adjustment is not supported by remote client.');
    }

    /* ----------------------- EXPOSURE TIME SETTING ------------------------ */
    if ('exposureTime' in capabilities)
    {
        expTimeSlider.min = capabilities.exposureTime.min;
        expTimeSlider.max = capabilities.exposureTime.max;
        expTimeSlider.step = capabilities.exposureTime.step;
        expTimeSlider.value = settings.exposureTime;
        expTimeValue.innerHTML = expTimeSlider.value;

        expTimeSlider.oninput = function(event) { expTimeValue.innerHTML = event.target.value; }

        expTimeSlider.disabled = false;
    }
    else
    {
        expTimeSlider.value = 0;
        console.log('CLIENT: Exposure time adjustment is not supported by remote client.');
    }

    /* ----------------------------- ISO SETTING ---------------------------- */
    if ('iso' in capabilities)
    {
        isoSlider.min = capabilities.iso.min;
        isoSlider.max = capabilities.iso.max;
        isoSlider.step = 100;
        isoSlider.value = settings.iso;
        isoValue.innerHTML = isoSlider.value;

        isoSlider.oninput = function(event) { isoValue.innerHTML = event.target.value; }

        isoSlider.disabled = false;
    }
    else
    {
        isoSlider.value = 0;
        console.log('CLIENT: ISO adjustment is not supported by remote client.');
    }

    /* ----------------------- FOCUS CONTROL SELECTION ---------------------- */
    if ('focusMode' in capabilities)
    {
        if      (settings.focusMode === 'continuous')   { focusSelector[0].checked = true; }
        else if (settings.focusMode === 'single-shot')  { focusSelector[1].checked = true; }
        else if (settings.focusMode === 'manual')       { focusSelector[2].checked = true; }

        for (var k = 0; k < focusSelector.length; k++)
        {
            focusSelector[k].disabled = false;
        }
    }
    else
    {
        console.log('CLIENT: Focus control is not supported by remote client.');
    }

    /* ----------------------- FOCUS DISTANCE SETTING ----------------------- */
    if ('focusDistance' in capabilities)
    {
        focusSlider.min = capabilities.focusDistance.min;
        focusSlider.max = capabilities.focusDistance.max;
        focusSlider.step = capabilities.focusDistance.step;
        focusSlider.value = settings.focusDistance;
        focusValue.innerHTML = focusSlider.value;

        focusSlider.oninput = function(event) { focusValue.innerHTML = event.target.value; }

        focusSlider.disabled = false;
    }
    else
    {
        focusSlider.value = 0;
        console.log('CLIENT: Focal distance adjustment is not supported by remote client.');
    }

    /* --------------------- WHITE BALANCE CONTROL MODE --------------------- */
    if ('whiteBalanceMode' in capabilities)
    {
        if      (settings.whiteBalanceMode === 'continuous')    { whtBalSelector[0].checked = true; }
        else if (settings.whiteBalanceMode === 'manual')        { whtBalSelector[1].checked = true; }
        else if (settings.whiteBalanceMode === 'none')          { whtBalSelector[2].checked = true; }

        for (var k = 0; k < whtBalSelector.length; k++)
        {
            whtBalSelector[k].disabled = false;
        }
    }
    else
    {
        console.log('CLIENT: White balance control is not supported by remote client.');
    }

    /* --------------------- COLOR TEMPERATURE SETTING ---------------------- */
    if ('colorTemperature' in capabilities)
    {
        colorTempSlider.min = capabilities.colorTemperature.min;
        colorTempSlider.max = capabilities.colorTemperature.max;
        colorTempSlider.step = capabilities.colorTemperature.step;
        colorTempSlider.value = settings.colorTemperature;
        colorTempValue.innerHTML = colorTempSlider.value;

        colorTempSlider.oninput = function(event) { colorTempValue.innerHTML = event.target.value; }

        colorTempSlider.disabled = false;
    }
    else
    {
        colorTempSlider.value = 0;
        console.log('CLIENT: Color temperature adjustment is not supported by remote client.');
    }

    /* ---------------------------- ZOOM SETTING ---------------------------- */
    if ('zoom' in capabilities)
    {
        zoomSlider.min = capabilities.zoom.min;
        zoomSlider.max = capabilities.zoom.max;
        zoomSlider.step = capabilities.zoom.step;
        zoomSlider.value = settings.zoom;
        zoomValue.innerHTML = zoomSlider.value;

        zoomSlider.oninput = function(event) { zoomValue.innerHTML = event.target.value; }

        zoomSlider.disabled = false;
    }
    else
    {
        zoomSlider.value = 0;
        console.log('CLIENT: Zoom is not supported by remote client.');
    }

    /* ---------------------------- TORCH SETTING --------------------------- */
    if ('torch' in capabilities)
    {
        if      (settings.torch === false)  { torchSelector[0].checked = true; }
        else if (settings.torch === true)   { torchSelector[1].checked = true; }

        for (var k = 0; k < torchSelector.length; k++)
        {
            torchSelector[k].disabled = false;
        }
    }
    else
    {
        console.log('CLIENT: Torch control is not supported by remote client.');
    }

    applyConfigButton.disabled = false;
    requestSequenceButton.disabled = false;
}

function assembleNewConfigForRemote()
/**
  * TODO: Add function description.
  */
{
    let newConstraints = { width: { exact: "" }, advanced: [{}] };

    /* ---------------------------- VIDEO WIDTH ----------------------------- */
    /* if (widthSlider.disabled === false)
    {
        newConstraints.width.exact = widthSlider.value;
    } */
    
    // Conditionals to check the status of the radio buttons before plugging them into the constraints applicator.
    /* ------------ EXPOSURE CONTROL, COMPENSATION, TIME SETTINGS ----------- */
    if (expSelector[0].checked)
    {
        newConstraints.advanced[0].exposureMode = "continuous";
    }
    else if (expSelector[1].checked)
    {
        newConstraints.advanced[0].exposureMode = "manual";

        if (expCompSlider.disabled === false)
        {
            newConstraints.advanced[0].exposureCompensation = expCompSlider.value;
        }
    }

    /* ----------------------------- ISO SETTING ---------------------------- */
    if (isoSlider.disabled === false)
    {
        newConstraints.advanced[0].iso = isoSlider.value;
    }

    /* ------------------ FOCUS CONTROL, DISTANCE SETTINGS ------------------ */
    if (focusSelector[0].checked)
    {
        newConstraints.advanced[0].focusMode = "continuous";
    }
    else if (focusSelector[1].checked)
    {
        newConstraints.advanced[0].focusMode = "single-shot";
    }
    else if (focusSelector[2].checked)
    {
        newConstraints.advanced[0].focusMode = "manual";

        if (focusSlider.disabled === false)
        {
            newConstraints.advanced[0].focusDistance = focusSlider.value;
        }
    }

    /* -------------- WHITE BALANCE, COLOR TEMPERATURE SETTINGS ------------- */
    if (whtBalSelector[0].checked)
    {
        newConstraints.advanced[0].whiteBalanceMode = "continuous";
    }
    else if (whtBalSelector[1].checked)
    {
        newConstraints.advanced[0].whiteBalanceMode = "manual";
        
        if (colorTempSlider.disabled === false)
        {
            newConstraints.advanced[0].colorTemperature = colorTempSlider.value;
        }
    }
    else if (whtBalSelector[2].checked)
    {
        newConstraints.advanced[0].whiteBalanceMode = "none";
    }

    /* ---------------------------- ZOOM SETTING ---------------------------- */
    if (zoomSlider.disabled === false)
    {
        newConstraints.advanced[0].zoom = zoomSlider.value;
    }

    /* --------------------------- TORCH CONTROLS --------------------------- */
    if (torchSelector[0].checked)
    {
        newConstraints.advanced[0].torch = "false";
    }
    else if (torchSelector[1].checked)
    {
        newConstraints.advanced[0].torch = "true";
    }

    return newConstraints;
}