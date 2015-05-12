var Emitter = require('events').EventEmitter;

exports = module.exports = function(emitter, client) {
  return function(ns) {
    ns = ns || '*';
    
    var receiveKey = ['received', 'event', ns].join('-');
    var em = new Emitter();
    
    em.client = client;
    em.$emit = em.emit.bind(em);
    
    function onMessage(data) {
      em.$emit.apply(null, data.args);
    }
    
    emitter.on(receiveKey, onMessage);
    
    emitter.once('disconnect', function() {
      emitter.removeListener(receiveKey, onMessage);
    });
    
    em.emit = function() {
      emitter.emit('send', {
        type: 'event',
        ns: ns,
        args: [].slice.call(arguments)
      });
    }
    
    return em;
  }
}