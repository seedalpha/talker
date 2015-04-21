exports = module.exports = function(emitter, identity, getClient) {
  return function(ns, api) {
    if (typeof api === 'undefined') {
      api = ns;
      ns = '*';
    }
    
    emitter.on('received-' + identity, function(data) {
      if (data.type === 'rpc' && data.ns === ns) {
        var method = api[data.method];
        if (method) {
          method.apply({ client: getClient() }, data.args.concat(function(err, result) {
            emitter.emit('send-' + identity, {
              id: data.id,
              type: 'rpc',
              ns: ns,
              error: err,
              result: result
            });
          }));
        } else {
          emitter.emit('send-' + identity, {
            type: 'rpc',
            ns: ns,
            id: data.id,
            error: 'method ' + data.method + ' not found'
          });
        }
      }
    });
  }
}