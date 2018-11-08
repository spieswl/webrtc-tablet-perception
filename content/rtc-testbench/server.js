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