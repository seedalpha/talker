var Emitter = require('events').EventEmitter;

exports = module.exports = function(emitter) {
  return function(ns) {
    ns = ns || '*';
    
    var em = new Emitter();
    
    em.$emit = em.emit.bind(em);
    
    var receiveKey = ['received', 'event', ns].join('-');
    
    emitter.on(receiveKey, function(data) {
      em.$emit.apply(null, data.args);
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