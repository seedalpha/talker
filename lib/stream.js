var Duplex = require('stream').Duplex;

exports = module.exports = function(emitter, options) {
  options = options || {};
  var stream = new Duplex(options);
  
  var ended = false;
  var readClosed = false;
  var writeClosed = false;
  
  // readable
  
  stream._read = function noop() {};
  
  emitter.on('data', function(data) {
    if (options.binary && data) data = Buffer(data, 'base64');
    stream.push(data);
    if (data === null) {
      readClosed = true;
      if (writeClosed) {
        stream.end();
      }
    }
  });
  
  emitter.on('error', function(err) {
    if (ended) return;
    stream.emit('error', err);
    ended = true;
  });
  
  // emitter.on('end', function(data) {
  //   if (ended) return;
  //   stream.push(data || null);
  //   readClosed = true;
  //   if (writeClosed) {
  //     stream.end();
  //   }
  // });
  
  setTimeout(function() {
    stream.resume();
  }, 0);
  
  stream.pause();
  
  // writeable
  
  stream._write = function(chunk, enc, done) {
    if (ended) return;
    if (options.binary) chunk = chunk.toString('base64');
    emitter.emit('data', chunk);
    done();
  }
  
  stream.on('finish', function() {
    if (ended) return;
    emitter.emit('data', null);
    writeClosed = true;
    if (readClosed) {
      stream.end();
    }
  });
  
  stream.on('error', function(err) {
    if (ended) return;
    emitter.emit('error', err);
    ended = true;
    stream.end();
  });
  
  return stream;
}