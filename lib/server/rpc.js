exports = module.exports = function(emitter, client) {
  return function(ns, api) {
    if (typeof api === 'undefined') {
      api = ns;
      ns = '*';
    }
    
    var receiveKey = ['received', 'rpc', ns].join('-');
    
    function onMessage(data) {
      var method = api[data.method];
  
      if (method) {
        var cb = function(err, result) {
          emitter.emit('send', {
            id: data.id,
            type: 'rpc',
            ns: ns,
            error: err,
            result: result
          });
        }
        var args = data.args.concat(cb);
        method.apply({ client: client }, args);
      } else {
        emitter.emit('send', {
          type: 'rpc',
          ns: ns,
          id: data.id,
          error: 'method ' + data.method + ' not found'
        });
      }
    }
    
    emitter.on(receiveKey, onMessage);
    
    emitter.once('disconnect', function() {
      emitter.removeListener(receiveKey, onMessage);
    });
  }
}