var talk = require('../');
var shoe = require('shoe');

var remote  = talk(shoe('/talk'), '12345');

var emitter = remote.emitter();
var rpc     = remote.rpc();

emitter.on('pong', function() {
  console.log('pong');
});

emitter.emit('ping');

emitter.on('echo', function(msg) {
  console.log('echo', msg);
});

emitter.emit('echo', 'Hello');

rpc.call('hello', function(err, result) {
  console.log('rpc hello', err, result);  
});

rpc.call('sum', 2, 2,function(err, result) {
  console.log('rpc sum', err, result);  
});

rpc.call('missing', function(err, result) {
  console.log('method missing', err, result);  
});