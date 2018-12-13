var EventEmitter  = require('events').EventEmitter;
var through       = require('through2').obj;
var parse         = require('./json').parse;
var stringify     = require('./json').stringify;
var head          = require('./head');
var pubsub        = require('./pubsub');
var pump          = require('pump');
var debug         = require('debug');

var log    = debug('talker');
var logErr = debug('talker:error');

/**
 * Get unique array value (filter iterator)
 */

function unique(value, index, self) {
  return self.indexOf(value) === index;
}

/**
 * talker
 * @param {Function} errHandler, error handler function
 * @param {Function} callback(remote, client)
 * @param {Function} [authFn] (token, callback(err, user)), optional
 * @return {Function} handle(stream)
 */

function talker(errHandler, cb, authFn) {
  var connections = {};
  var channels = {};
  if (!errHandler) errHandler = function (e) { return e; };
  function broadcast(namespace, connection, emitter) {
    namespace = namespace || '*';
    return function(list, options) {
      if (!Array.isArray(list)) {
        list = [list];
      }

      options = options || {
        excludeSelf: false
      };

      return {
        emit: function() {
          var args = [].slice.call(arguments);
          args.unshift(namespace);
          args.unshift('event');
    
          // TODO: filter by session id (client id)
          var conns = [];
    
          list.forEach(function(channel) {
            var key = [namespace, channel].join(':');
            (channels[key] || []).forEach(function(conn) {
              if (options.excludeSelf && conn === connection) {
                return;
              }
              conns.push(conn);
            });
          });
    
          conns.forEach(function(conn) {
            conn.send(args);
          });
    
          return emitter;
        }
      }
    }
  }
  
  function streamHandle(stream) {
    var emitters  = {};
    var rpcs      = {};
  
    var connection = {
      id: Date.now() + Math.random(),
      emitters: emitters,
      rpcs: rpcs,
      ended: false
    };
  
    connections[connection.id] = connection;
  
    stream.on('end', cleanup);
    stream.on('close', cleanup);
    stream.on('error', function(err) {
      cleanup();
      logErr('%s', err);
      // logErr(err);
      errHandler(err);
      stream.end();
    });
  
    function cleanup() {
      if (connection.ended) return;
      connection.ended = true;

      Object.keys(emitters).forEach(function(namespace) {
        emitters[namespace].forEach(function(emitter) {
          emitter.$emit('disconnect');
        });
        
        process.nextTick(function() {
          emitters[namespace].forEach(function(emitter) {
            emitter.removeAllListeners();
          });
          
          Object.keys(channels).forEach(function(name) {
            channels[name] = (channels[name] || []).filter(function(conn) {
              return conn !== connection;
            });
            
            if (!channels[name].length) {
              delete channels[name];
            }
          });
          
          delete emitters;
          delete rpcs;
        });
      });

      process.nextTick(function () {
        delete connections[connection.id];
        delete connection;
      });
    }
  
    function send(args) {
      if (connection.ended) {
        errHandler(new Error('SEND_TO_DISCONNECT:' + JSON.stringify(args)));
        return logErr('Sending event to a disconnected client %j', args);
      }
      try {
        stream.write(JSON.stringify(args));
      } catch (e) {
        stream.emit('error', e);
      }
    }
    
    connection.send = send;
    connection.send(['_action', 'setConnectionId', connection.id]);
  
    function init(client) {
    
      function createEmitter(namespace) {
        var emitter = new EventEmitter();
        emitter.client = client;
        // TODO: does it make sense to cache emitters?
        // feels like channels wont work as expected
        // emitter.channels = [];
        namespace = namespace || '*';
        emitters[namespace] = emitters[namespace] || [];
        emitters[namespace].push(emitter);

        emitter.$emit = emitter.emit.bind(emitter);
        emitter.emit = function() {
          var args = [].slice.call(arguments);
          args.unshift(namespace);
          args.unshift('event');
          send(args);
        }
        emitter.join = function() {
          // join a list of channels
          var list = [].slice.call(arguments);
          if (Array.isArray(list[0])) {
            list = list[0];
          }
          list.filter(unique).forEach(function(channel) {
            var key = [namespace, channel].join(':');
            channels[key] = channels[key] || [];
            channels[key].push(connection);
          });
          return emitter;
        }
        emitter.leave = function() {
          // leave a list of channels
          var list = [].slice.call(arguments);
          if (Array.isArray(list[0])) {
            list = list[0];
          }
          list.filter(unique).forEach(function(channel) {
            var key = [namespace, channel].join(':');
            channels[key] = (channels[key] || []).filter(function(conn) {
              return conn !== connection;
            });
            if (!channels[key].length) {
              delete channels[key];
            }
          });
          return emitter;
        }
        emitter.broadcast = broadcast(namespace, connection, emitter);
        return emitter;
      }
    
      function createPubsub(namespace) {
        var emitter = createEmitter('pubsub' + (namespace || '*'));
        var ps = pubsub(client, emitter);
      
        emitter.on('disconnect', function() {
          ps.close();
        });
      
        return ps;
      }

      cb({
        remoteAddress: stream.remoteAddress,
        emitter: createEmitter,
        rpc: function(namespace, api, context) {
          if (typeof api === 'undefined') {
            api = namespace;
            namespace = '*';
          }
          if (typeof namespace === 'object') {
            context = api;
            api = namespace;
            namespace = '*';
          }
        
          rpcs[namespace] = { 
            api: api, 
            context: context
          };
        },
        pubsub: createPubsub,
        connected: function() {
          return !connection.ended;
        },
        close: function() {
          cleanup();
          stream.end();
        },
        get connectionId () {
          return connection && connection.id;
        } 
      }, client);
    }
  
    var ops = {
      event: function(data) {
        var namespace = data.shift();
        if (!emitters[namespace]) {
          errHandler(new Error('UNKNOWN_NS:' + namespace));
          return logErr('Unknown namespace: %s', namespace);
        }
        for (var index in emitters[namespace]) {
          emitters[namespace][index].$emit.apply(null, data);
        }
      },
      rpc: function(data) {
        var namespace = data.shift();
        var id = data.shift();
        var method = data.shift();
        if (!rpcs[namespace]) {
          errHandler(new Error('UNKNOWN_NS:' + namespace));
          return logErr('Unknown namespace: %s', namespace);
        }
        var rpc = rpcs[namespace];
        if (!rpc.api[method]) {
          errHandler(new Error('UNKNOWN_METHOD:' + method));
          logErr('Unknown method: %s', method);
          var args = ['rpc', namespace, id, 'method missing'];
          send(args);
          return;
        }
        data.push(function() { // callback
          var args = [].slice.call(arguments);
          args.unshift(id);
          args.unshift(namespace);
          args.unshift('rpc');
          send(args);
        });
        rpc.api[method].apply(rpc.context || null, data);
      },
      _action: function(data) {
        var action = data.shift();
        var payload = data.shift();
        switch (action) {
          case 'acceptConnectionId':
            log('Accept connection ID: %s', payload);
            break; 
          default: break;
        }
      }
    };
  
    var handle = through(function(data, enc, cb) {
      // for events: [type: 'event', namespace: '*', event: 'echo', arg0: 'hello', arg1: 'world', ...]
      // for rpcs:   [type: 'rpc', namespace: '*', id: '1234', method: 'echo', arg0: 'hello', arg1: 'world', ...]
      log('received %j', data);
      var type = data.shift();
      if (!ops[type]) {
        errHandler(new Error('UNKNOWN_TYPE:' + type));
        return logErr('Unknown type: %s', type);
      } else {
        ops[type](data);
      }
      cb();
    });
  
    var auth = head(function(buffer, done) {
      if (authFn) {
        authFn(buffer.toString(), function(err, client) {
          if (err) {
            errHandler(new Error(err));
            return done(err);
          }
          init(client);
          done();
        });
      } else {
        done(null, buffer);
      }
    });
  
    if (!authFn) {
      init();
    }
  
    pump(stream, auth, parse(), handle, function(err) {
      logErr('Pipeline error: %s', err);
      // logErr(err);
      errHandler(err);
      stream.destroy();
      cleanup();
    });
  }
  
  return {
    emitter: function(namespace) {
      return {
        broadcast: broadcast(namespace)
      }
    },
    handle: streamHandle,
    get connections () {
      return connections;
    } 
  }
}

/**
 * Expose
 */

exports = module.exports = talker;