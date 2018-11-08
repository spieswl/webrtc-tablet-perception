'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const nodeStatic = require('node-static');
const fileServer = new(nodeStatic.Server)();

var options = {
    key: fs.readFileSync('certs/privateKey.key'),
    cert: fs.readFileSync('certs/certificate.crt')
};

// HTTPS
const https_app = https.createServer(options, function (req, res)
{
    fileServer.serve(req, res);
})
.listen(443);

// HTTP redirect to HTTPS
const http_redir = http.createServer(function (req, res)
{
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
})
.listen(80);

// Socket.IO
var io = require('socket.io').listen(https_app);

io.on('connection', function(socket)
{
    // Convenience function to log server messages on the terminal
    function log()
    {
        var array = ['SERVER:'];
        array.push.apply(array, arguments);
        socket.emit('log', array);

        console.log('SERVER:', arguments);
    }

    socket.on('ready', function()
    {
        log('Client ID ' + socket.id + ' signalled READY!');
        socket.broadcast.emit('ready');
    });

    socket.on('message', function(message)
    {
        log('Client ID ' + socket.id + ' signalled: ', message);
        socket.broadcast.emit('message', message);
    });

    socket.on('image_request', function()
    {
        log('Client ID ' + socket.id + ' requested a single image.');
        socket.broadcast.emit('image_request');
    });

    socket.on('sequence_request', function()
    {
        log('Client ID ' + socket.id + ' requested a capture sequence.');
        socket.broadcast.emit('sequence_request');
    });

    socket.on('settings_request', function()
    {
        log('Client ID ' + socket.id + ' requested current settings for the remote measurement device.');
        socket.broadcast.emit('settings_request');
    });

    socket.on('apply_request', function(settings)
    {
        log('Client ID ' + socket.id + ' requested that the remote measurement device use the packaged settings.', settings);
        socket.broadcast.emit('apply_request', settings);
    });

    socket.on('settings_response', function(constraints, settings, capabilities)
    {
        log('Client ID ' + socket.id + ' replied to a remote device settings enumeration request.', constraints, settings, capabilities);
        socket.broadcast.emit('settings_response', constraints, settings, capabilities);
    });

    socket.on('apply_response', function(boolean)
    {
        log('Client ID ' + socket.id + ' replied to a remote device settings application request.');
        socket.broadcast.emit('apply_response', boolean);
    });

    socket.on('disconnect', function(reason)
    {
        log(`Peer or server disconnected. Reason: ${reason}.`);
        socket.broadcast.emit('bye');
    });

    socket.on('bye', function(room)
    {
        log(`Client said bye!`);
    });
})

// Misc.
console.log("SERVER: HTTP redirecting to HTTPS on port 443...");
console.log("SERVER: WebRTC page is up!");