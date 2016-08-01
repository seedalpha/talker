var memwatch = require('memwatch-next');

var http        = require('http');
var talk        = require('../');
var ws          = require('websocket-stream');
var talkClient  = require('../lib/talker/client');
var server      = http.createServer();
var Queue       = require('seed-queue');
var fs          = require('fs');
var assert      = require('assert');

function createServer(path, api) {
  ws.createServer({
    server: server,
    path: path
  }, api.handle);
}

function createClient(path, token) {
  return talkClient(function() {
    return ws('ws://localhost:50006' + path);
  }, token);
}

var AUTH_TOKEN = '12345';

function auth(token, cb) {
  process.nextTick(function() {
    cb(token === AUTH_TOKEN ? null : 'access denied', { name: 'test' });
  });
}

function onConnection(t, client) {
  var emitter = t.emitter();
  
  emitter.on('date', function(date) {
    emitter.emit('date', date);
  });
  
  emitter.on('clientId', function(id) {
    if (id % 2) {
      t.close();
    } else {
      emitter.emit('clientId', 1);
    }
  });
  
  t.rpc({
    date: function(cb) {
      cb(null, Date.now());
    }
  });
}

function times(num, fn) {
  for (var i = 0; i < num; i++) {
    fn();
  }
}

function asyncTimes(num, fn, done) {
  var queue = new Queue();
  for (var i = 0; i < num; i++) {
    queue.add(fn);
  }
  queue.end(done);
}

var api = talk(auth, onConnection);

function batch(next) {
  var client = createClient('/leak', AUTH_TOKEN);
  var emitter = client.emitter();
  var rpc = client.rpc();
  var count = 0;
  
  emitter.on('date', function(date) {
    count++;
    if (count === 1000) {
      client.close();
      console.log('batch');
      next();
    }
  });
  
  rpc.call('date', function(err, date) {
    times(1000, function() {
      emitter.emit('date', date);
    });
  });
}

describe('leak detection', function() {
  
  before(function(done) {
    server.listen(50006, done);
  });
  
  before(function() {
    this.server = createServer('/leak', api);
  });
  
  before(function() {
    this.heap = new memwatch.HeapDiff();
  });
  
  before(function() {
    this.leaked = false;
        
    memwatch.on('leak', function(info) {
      console.log('Leak: ');
      console.dir(info);
      this.leaked = true;
    }.bind(this));
    
    memwatch.on('stats', function(stats) {
      console.log('Stats: ');
      console.dir(stats);
    });
  });
  
  after(function() {
    fs.writeFileSync(__dirname + '/heap.json', JSON.stringify(this.heap.end()));
  });
  
  it('should not leak data over time', function(done) {
    var getLeak = function() {
      return this.leaked;
    }.bind(this);
    
    asyncTimes(100, batch, function() {
      assert(getLeak() === false);
      done();
    });
  });
  
});