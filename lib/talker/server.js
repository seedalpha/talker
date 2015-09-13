var EventEmitter  = require('events').EventEmitter;
var through       = require('through2').obj;
var parse         = require('./json').parse;
var stringify     = require('./json').stringify;
var head          = require('./head');
var log           = require('debug')('talker');
var pump          = require('pump');

/**
 * talker
 *
 * @param {Function} authFn(token, callback(err, user)), optional
 * @param {Function} callback(remote, client)
 * @return {Function} handle(stream)
 */

function talker(authFn, cb) {
  if (typeof cb === 'undefined') {
    cb = authFn;
    authFn = null;
  }
  
  return function(stream) {
    
    var emitters  = {};
    var rpcs      = {};
    var ended     = false;
    
    stream.on('end', cleanup);
    
    stream.on('close', cleanup);
    stream.on('error', function(err) {
      cleanup();
      log('Stream error %j', err);
      stream.end();
    });
    
    function cleanup() {
      if (ended) return;
      ended = true;
      Object.keys(emitters).forEach(function(namespace) {
        emitters[namespace].forEach(function(emitter) {
          emitter.$emit('disconnect');
        });
        process.nextTick(function() {
          emitters[namespace].forEach(function(emitter) {
            emitter.removeAllListeners();
          });
          delete emitters;
          delete rpcs;
        });
      });
    }
    
    function send(args) {
      if (ended) return log('sending event to a disconnected client %j', args);
      try {
        stream.write(JSON.stringify(args));
      } catch (e) {
        stream.emit('error', e);
      }
    }
    
    function init(client) {
      cb({
        emitter: function(namespace) {
          var emitter = new EventEmitter();
          emitter.client = client;
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
          
          return emitter;
        },
        rpc: function(namespace, api) {
          if (typeof api === 'undefined') {
            api = namespace;
            namespace = '*';
          }
          rpcs[namespace] = api;
        },
        connected: function() {
          return !ended;
        }
      }, client);
    }
    
    var ops = {
      event: function(data) {
        var namespace = data.shift();
        if (!emitters[namespace]) return log('unknown namespace %s', namespace);
        for (var index in emitters[namespace]) {
          emitters[namespace][index].$emit.apply(null, data);
        }
      },
      rpc: function(data) {
        var namespace = data.shift();
        var id = data.shift();
        var method = data.shift();
        if (!rpcs[namespace]) return log('unknown namespace %s', namespace);
        var rpc = rpcs[namespace];
        if (!rpc[method]) {
          log('unknown method %s', method);
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
        rpc[method].apply(null, data);
      }
    };
    
    var handle = through(function(data, enc, cb) {
      // for events: [type: 'event', namespace: '*', event: 'echo', arg0: 'hello', arg1: 'world', ...]
      // for rpcs:   [type: 'rpc', namespace: '*', id: '1234', method: 'echo', arg0: 'hello', arg1: 'world', ...]
      log('received %j', data);
      var type = data.shift();
      if (!ops[type]) {
        return log('unknown type %s', type);
      } else {
        ops[type](data);
      }
      cb();
    });
    
    var auth = head(function(buffer, done) {
      if (authFn) {
        authFn(buffer.toString(), function(err, client) {
          if (err) return done(err);
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
      log('Pipeline error: %j', err);
      stream.destroy();
      cleanup();
    });
  }
}

/**
 * Expose
 */

exports = module.exports = talker;