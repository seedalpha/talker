var Emitter = require('events').EventEmitter;

exports = module.exports = function(emitter, identity) {
  return function(ns) {
    ns = ns || '*';
  
    var em = new Emitter();
  
    em.$emit = em.emit;
  
    emitter.on('received-' + identity, function(data) {
      if (data.type === 'event' && data.ns === ns) {
        em.$emit.apply(em, data.args);
      }
    });
  
    em.emit = function() {
      emitter.emit('send-' + identity, {
        type: 'event',
        ns: ns,
        args: [].slice.call(arguments)
      });
    }
    
    return em;
  }
}