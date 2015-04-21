var through = require('through2');

exports = module.exports = function(onHead) {
  
  var firstRow = true;
  var resumed = false;
  var queue = [];
  
  var stream = through.obj(function(chunk, enc, cb) {
    if (firstRow) {
      firstRow = false;
      onHead(chunk, function(err) {
        if (err) return cb(err);
        resumed = true;
        while(queue.length) {
          this.push(queue.shift());
        }
        cb();
      });
      return;
    }
    if (resumed) {
      this.push(chunk);
      cb();
    } else {
      queue.push(chunk);
      cb();
    }
  });
  
  return stream;
}