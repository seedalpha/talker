var through = require('through2');

exports = module.exports = function(onHead) {

  var firstRow = true;
  var resumed = false;
  var queue = [];
  
  function handle(chunk, enc, cb) {
    if (firstRow) {
      firstRow = false;
      onHead(chunk, function(err, result) {
        if (err) return cb(err);
        cb(null, result);
        while(queue.length) {
          this.push(queue.shift());
        }
        resumed = true;
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
  }
  
  return through.obj(handle);
}
