var EventEmitter = require('events').EventEmitter;
var Stream       = require('../stream');
var parse        = require('../json').parse;
var stringify    = require('../json').stringify;

exports = module.exports = function(emitter) {
  return function(ns, head) {
    if (typeof head === 'undefined') {
      head = ns;
      ns = '*';
    }
    
    var id = Date.now() + Math.random();
    
    head = head || {};
    
    var receiveKey = [
      'received', 
      'stream', 
      ns
    ].join('-');
    
    var em = new EventEmitter();
    em.$emit = em.emit.bind(em);
    em.emit = function() {
      emitter.emit('send', {
        type: 'stream',
        ns: ns,
        id: id,
        args: [].slice.call(arguments)
      });
    }
    
    function onMessage(data) {
      if (data.id !== id) return;
      em.$emit.apply(null, data.args);
    }
    
    var ended = false;
    function cleanup() {
      if (ended) return;
      ended = true;
      emitter.removeListener(receiveKey, onMessage);
    }
    
    emitter.on(receiveKey, onMessage);
    
    var stream = Stream(em, {
      // allowHalfOpen: true,
      objectMode: true,
      binary: head.binary
    });
    
    stream.on('end', cleanup);
    stream.on('error', cleanup);
    
    em.emit(head);
    
    return stream;
  }
}