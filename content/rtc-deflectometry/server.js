'use strict';

const os = require('os');
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

    socket.on('create or join', function(room)
    {
        log('Received request to create or join room ' + room + '.');
    
        var clientsInRoom = io.sockets.adapter.rooms[room];
        var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
        
        if (numClients === 0)
        {
            socket.join(room);
            log('Client ID ' + socket.id + ' created room ' + room + '.');
            socket.emit('created', room, socket.id);
        }
        else if (numClients === 1)
        {
            log('Client ID ' + socket.id + ' joined room ' + room + '.');
            socket.join(room);
            socket.emit('joined', room, socket.id);
            io.sockets.in(room).emit('ready', room);
        }
        else
        {
            socket.emit('full', room);
        }

        log('Room ' + room + ' now has ' + io.sockets.adapter.rooms[room].length + ' client(s).');
    });

    socket.on('message', function(message)
    {
        log('Client ID ' + socket.id + ' said: ', message);
        socket.broadcast.emit('message', message);
    });

    socket.on('imagerequest', function()
    {
        log('Client ID ' + socket.id + ' requested a single image.');
        socket.broadcast.emit('imagerequest');
    });

    socket.on('sequencerequest', function()
    {
        log('Client ID ' + socket.id + ' requested a capture sequence.');
        socket.broadcast.emit('sequencerequest');
    });

    socket.on('constraintsrequest', function()
    {
        log('Client ID ' + socket.id + ' requested available constraints for the measurement device.');
        socket.broadcast.emit('constraintsrequest');
    });

    socket.on('constraintsreply', function(message)
    {
        log('Client ID ' + socket.id + ' replied to an available constraints request.');
        socket.broadcast.emit('constraintsreply', message);
    });

    socket.on('applysettingsrequest', function(message)
    {
        log('Client ID ' + socket.id + ' requested that the measurement device use the packaged settings.');
        socket.broadcast.emit('applysettingsrequest', message);
    });

    socket.on('applysettingsreply', function(boolean)
    {
        log('Client ID ' + socket.id + ' replied to a settings application request.');
        socket.broadcast.emit('applysettingsreply', boolean);
    });

    socket.on('disconnect', function(reason)
    {
        log(`Peer or server disconnected. Reason: ${reason}.`);
        socket.broadcast.emit('bye');
    });

    socket.on('bye', function(room)
    {
        log(`Peer said bye on room ${room}.`);
    });
})

// Misc.
console.log("SERVER: HTTP redirecting to HTTPS on port 443...");
console.log("SERVER: WebRTC page is up!");