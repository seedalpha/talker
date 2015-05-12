var through  = require('through2').obj;
var Emitter  = require('events').EventEmitter;
var Stream   = require('../stream');

exports = module.exports = function(emitter, client) {
  return function(ns, fn) {
    if (typeof ns === 'function') {
      fn = ns;
      ns = '*';
    }
    
    var receiveKey = ['received', 'stream', ns].join('-');
    var streams = {};
    
    emitter.on(receiveKey, function(data) {
      if (streams[data.id]) return;
      streams[data.id] = true;
      var head = data.args[0];
      var id = data.id;
      var em = new Emitter();
      em.$emit = em.emit.bind(em);
      em.emit = function() {
        emitter.emit('send', {
          type: 'stream',
          ns: ns,
          id: data.id,
          args: [].slice.call(arguments)
        })
      }
      
      function onMessage(data) {
        if (data.id !== id) return;
        em.$emit.apply(null, data.args);
      }
      
      function onDisconnect() {
        delete streams[data.id];
        emitter.removeListener(receiveKey, onMessage);
        em.removeAllListeners();
      }
      
      var stream = Stream(em, {
        // allowHalfOpen: true,
        objectMode: true,
        binary: head.binary
      });
      
      stream.on('end', function() {
        // delete streams[data.id];
        emitter.removeListener(receiveKey, onMessage);
        emitter.removeListener('disconnect', onDisconnect);
        em.removeAllListeners();
      });
      
      
      emitter.on(receiveKey, onMessage);
      emitter.once('disconnect', onDisconnect);
      
      fn(head, stream, client);
    });
  }
}

// var through  = require('through2').obj;
// var EventEmitter = require('events').EventEmitter;
// var EventStream = require('../es');
//
// function getProxy(emitter, ns, id) {
//   var proxy       = new EventEmitter();
//   var receiveKey  = ['received', 'streams', ns].join('-');
//   proxy.$emit     = proxy.emit.bind(proxy);
//
//   proxy.emit = function() {
//     emitter.emit('send', {
//       type: 'streams',
//       ns: ns,
//       id: id,
//       args: [].slice.call(arguments)
//     });
//   }
//
//   emitter.on(receiveKey, function(data) {
//     if (data.id !== id) return;
//     proxy.$emit.apply(null, data.args);
//   });
//
//   emitter.on('disconnect', function() {
//     proxy.$emit.apply(null, ['disconnect']);
//   });
//
//   return proxy;
// }
// 
// exports = module.exports = function(emitter) {
//   return function(ns, cb) {
//     if (typeof ns === 'function') {
//       cb = ns;
//       ns = '*';
//     }
//
//     var receiveKey = ['received', 'streams', ns].join('-');
//
//     var proxies = {};
//
//     emitter.on(receiveKey, function(data) {
//       if (proxies[data.id]) return;
//
//       var proxy = proxies[data.id] = getProxy(emitter, ns, data.id);
//
//       proxy.on('end', function() {
//         delete proxies[data.id];
//         proxy.removeAllListeners();
//       });
//
//       var es = new EventStream(proxy);
//       var head = data.args[1];
//       var stream = head.readable ? es.createWriteStream(head) : es.createReadStream(head);
//
//       cb(head, stream);
//     });
//   }
// }