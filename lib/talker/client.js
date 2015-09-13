var EventEmitter  = require('events').EventEmitter;
var through       = require('through2').obj;
var parse         = require('./json').parse;
var log           = require('debug')('talker');
var debug         = require('debug');

debug.enable("talker");

/**
 * Helpers
 */

function generateId() {
  return (Date.now() + Math.random()).toString();
}

/**
 * Talker client
 *
 * @param {Function} fn, should return instance of stream
 * @param {String} auth, auth token to send first
 * @return {Object} talker
 *   @param {Function} emitter(namespace)
 *   @param {Function} rpc(namespace, timeout)
 */

function talker(fn, auth) {
  
  var connection = null;
  var queue = [];
  var emitters = {};
  var rpcs = {};
  var close = false;
  
  var ops = {
    event: function(args) {
      var namespace = args.shift();
      if (!emitters[namespace]) return log('unknown namespace %s', namespace);
      for (var index in emitters[namespace]) {
        emitters[namespace][index].$emit.apply(null, args);
      }
    },
    rpc: function(args) {
      var namespace = args.shift();
      var id = args.shift();
      if (!rpcs[namespace]) return log('unknown namespace %s', namespace);
      if (!rpcs[namespace][id]) return log('unknown id %s %s', namespace, id);
      clearTimeout(rpcs[namespace][id].timeoutId);
      rpcs[namespace][id].callback.apply(null, args);
      delete rpcs[namespace][id];
    }
  }
  
  function reconnect(cb) {
    if (close) return;
    var socket = fn();
    socket.on('end', onClose);
    socket.on('close', onClose);
    socket.on('error', onClose);
    socket.on('connect', function onConnect() {
      socket.removeListener('connect', onConnect);
      connection = socket;
      cb(socket);
    });
    
    function onClose() {
      socket.removeListener('end', onClose);
      socket.removeListener('close', onClose);
      socket.removeListener('error', onClose);
      connection = null;
      setTimeout(function() {
        reconnect(cb);
      }, 1000);
    }
  }
  
  function init(socket) {
    var handle = through(function(data, enc, cb) {
      log('received %j', data);
      var type = data.shift();
      if (!ops[type]) {
        return log('unknown type %s', type);
      } else {
        ops[type](data);
      }
      cb();
    });
    
    if (auth) {
      socket.write(auth);
    }
    
    while (queue.length) {
      socket.write(queue.shift());
    }
    
    socket.pipe(parse()).pipe(handle);
  }
  
  function send(data) {
    var message = JSON.stringify(data);
    if (connection && !queue.length) {
      try {
        connection.write(message);
      } catch (e) {
        log('disconnected: %s', e);
        connection = null;
        setTimeout(function() {
          reconnect(init);
        }, 1000);
        send(data);
      }
    } else {
      queue.push(message);
    }
  }
  
  reconnect(init);
  
  return {
    emitter: function(namespace) {
      namespace = namespace || '*';
      
      var emitter = new EventEmitter();
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
    rpc: function(namespace, timeout) {
      namespace = namespace || '*';
      timeout = timeout || 30000; // 30seconds
      rpcs[namespace] = rpcs[namespace] || {};
      return {
        call: function() {
          var args = [].slice.call(arguments);
          var callback = args.pop();
          var id = generateId();
          args.unshift(id);
          args.unshift(namespace);
          args.unshift('rpc');

          var timeoutId = setTimeout(function() {
            delete rpcs[namespace][id];
            callback(new Error('timeout'));
          }, timeout);
          
          rpcs[namespace][id] = {
            callback: callback,
            timeoutId: timeoutId
          }
          
          send(args);
        }
      }
    },
    close: function() {
      close = true;
      connection && connection.destroy();
    },
    connected: function() {
      return !!connection;
    }
  }
}

/**
 * Expose
 */

exports = module.exports = talker;