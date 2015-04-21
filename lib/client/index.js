var EventEmitter  = require('events').EventEmitter;
var through       = require('through2');
var Emitter       = require('./emitter');
var RPC           = require('./rpc');

exports = module.exports = function(socket, auth) {

  var emitter = new EventEmitter();
  
  var handle = through.obj(function(chunk, enc, cb) {
    emitter.emit('received', JSON.parse(chunk.toString()));
    cb();
  })
  
  emitter.on('send', function(data) {
    socket.write(JSON.stringify(data));
  });
  
  socket
    .pipe(handle)
    .pipe(socket);
  
  if (auth) {
    socket.write(auth);
  }
  
  return {
    emitter: Emitter(emitter),
    rpc: RPC(emitter)
  }
}