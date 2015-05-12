var EventEmitter  = require('events').EventEmitter;
var through       = require('through2');
var Emitter       = require('./emitter');
var RPC           = require('./rpc');
var Streams       = require('./streams');

exports = module.exports = function(fn, auth) {
  
  var emitter = new EventEmitter();
  var buffer = [];
  var connection;
  
  emitter.on('send', function(data) {
    if (buffer.length || !connection) {
      buffer.push(data);
      return;
    }
    connection.write(JSON.stringify(data));
  });
  
  function reconnect(cb) {
    
    var socket = fn();
    
    socket.on('end', onClose);
    socket.on('close', onClose);
    socket.on('error', onClose);
    socket.on('connect', function onConnect() {
      socket.removeListener('end', onClose);
      socket.removeListener('close', onClose);
      socket.removeListener('error', onClose);
      socket.removeListener('connect', onConnect);
      cb(socket);
    });
    
    function onClose() {
      setTimeout(function() {
        reconnect(cb);
      }, 1000);
    }
  }
  
  function init(socket) {
    connection = socket;
    
    var handle = through.obj(function(chunk, enc, cb) {
      var data = JSON.parse(chunk.toString());
      emitter.emit(['received', data.type, data.ns].join('-'), data);
      cb();
    });
    
    while (buffer.length) {
      socket.write(JSON.stringify(buffer.shift()));
    }
    
    socket.on('close', function() {
      delete connection;
      emitter.emit('disconnect');
      reconnect(init);
    });
    
    socket.on('end', function() {
      delete connection;
      emitter.emit('disconnect');
      reconnect(init);
    });
    
    socket
      .pipe(handle)
      .pipe(socket);
    
    if (auth) {
      socket.write(auth);
    }
  }
  
  init(fn());
  
  return {
    emitter: Emitter(emitter),
    rpc: RPC(emitter),
    stream: Streams(emitter)
  }
}