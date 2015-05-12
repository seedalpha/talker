var through = require('through2').obj;

exports.parse = function() {
  return through(function(chunk, enc, cb) {
    var data;
    try {
      data = JSON.parse(chunk);
    } catch (e) {
      cb(e);
    }
  
    cb(null, data);
  });
}

exports.stringify = function() {
  return through(function(chunk, enc, cb) {
    cb(null, JSON.stringify(chunk));
  });
}