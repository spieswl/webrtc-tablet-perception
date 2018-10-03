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
}).listen(443);

// HTTP redirect
const http_redir = http.createServer(function (req, res)
{
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(80);

// Socket.IO
var io = require('socket.io').listen(https_app);
io.sockets.on('connection', function(socket)
{
    // convenience function to log server messages on the client
    function log()
    {
        var array = ['SERVER:'];
        array.push.apply(array, arguments);
        socket.emit('log', array);
    }

    socket.on('ipaddr', function()
    {
        var ifaces = os.networkInterfaces();
        for (var dev in ifaces)
        {
            ifaces[dev].forEach(function(details)
            {
                if (details.family === 'IPv4' && details.address !== '127.0.0.1')
                {
                    socket.emit('ipaddr', details.address);
                }
            });
        }
    });

    socket.on('create or join', function(room)
    {
        log('Received request to create or join room ' + room);
    
        var clientsInRoom = io.sockets.adapter.rooms[room];
        var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
        
        if (numClients === 0)
        {
            socket.join(room);
            log('Client ID ' + socket.id + ' created room ' + room);
            socket.emit('created', room, socket.id);
        }
        else if (numClients === 1)
        {
            log('Client ID ' + socket.id + ' joined room ' + room);
            socket.join(room);
            socket.emit('joined', room, socket.id);
            io.sockets.in(room).emit('ready', room);
            socket.broadcast.emit('ready', room);
        }
        else    // max two clients
        {
            socket.emit('full', room);
        }

        log('Room ' + room + ' now has ' + io.sockets.adapter.rooms[room].length + ' client(s)');
    });

    socket.on('message', function(message)
    {
        log('Client said: ', message);
        // for a real app, would be room-only (not broadcast)
        socket.broadcast.emit('message', message);
    });

    socket.on('imagerequest', function()
    {
        log('Client requested an image.');
        socket.broadcast.emit('imagerequest');
    });

    socket.on('disconnect', function(reason) {
        console.log(`Peer or server disconnected. Reason: ${reason}.`);
        socket.broadcast.emit('bye');
    });

    socket.on('bye', function(room) {
        console.log(`Peer said bye on room ${room}.`);
    });
})

// Misc.
console.log("HTTP redirecting to HTTPS on port 443...");
console.log("WebRTC Page is up!");