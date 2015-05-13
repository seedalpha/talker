var EventEmitter  = require('events').EventEmitter;
var through       = require('through2').obj;

var parse         = require('../json').parse;
var stringify     = require('../json').stringify;
var head          = require('../head');

var debug         = require('debug')('talker');

var Emitter       = require('./emitter');
var RPC           = require('./rpc');
var Streams        = require('./streams');

exports = module.exports = function(authFn, cb) {
  
  if (typeof cb === 'undefined') {
    cb = authFn;
    authFn = null;
  }
  
  return function(stream) {
    var id      = Date.now() + Math.random();
    var em      = new EventEmitter();
    
    em.setMaxListeners(0);
    
    var ended   = false;
    var handle  = through(function(data, enc, cb) {
      var parts = ['received', data.type, data.ns];
      em.emit(parts.join('-'), data);
      cb();
    });
    
    var init = function(client) {
      cb({
        emitter: Emitter(em, client),
        rpc: RPC(em, client),
        stream: Streams(em, client)
      }, client);
    }
    
    if (authFn) {
      stream
        .pipe(head(function(buffer, done) {
          authFn(buffer.toString(), function(err, client) {
            if (err) return done(err);
            init(client);
            done();
          });
        }))
        .pipe(parse())
        .pipe(handle)
        .pipe(stringify())
        .pipe(stream);
    } else {
      stream
        .pipe(parse())
        .pipe(handle)
        .pipe(stringify())
        .pipe(stream);
      
      init();
    }
    
    em.on('send', function(data) {
      if (ended) return;
      stream.write(JSON.stringify(data));
    });
  
    stream.on('end', function() {
      ended = true;
      em.emit('disconnect');
    });
  
    stream.on('close', function() {
      ended = true;
      em.emit('disconnect');
    });
    
    stream.on('error', function(err) {
      ended = true;
      debug('Stream error %j', err);
      stream.destroy();
    });
  }
}