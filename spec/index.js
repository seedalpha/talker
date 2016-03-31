var http        = require('http');
var talk        = require('../');
var shoe        = require('shoe');
var ws          = require('websocket-stream');
var talkClient  = require('../lib/talker/client');
var server      = http.createServer();
var should      = require('chai').should();

server.setMaxListeners(20);

function createServer(path, api) {
  ws.createServer({
    server: server,
    path: path
  }, api);
}

function createClient(path, token) {
  return talkClient(function() {
    return ws('ws://localhost:50005' + path);
  }, token);
}

var AUTH_TOKEN = '12345';

function auth(token, cb) {
  cb(token === AUTH_TOKEN ? null : 'access denied', { name: 'test' });
}

var api = {
  increment: function(n, cb) {
    if (typeof n !== 'number') {
      cb('n should be a number');
    } else {
      cb(null, n + 1);
    }
  }
}

describe('talker', function() {
  
  before(function(done) {
    server.listen(50005, done);
  });
  
  describe('auth', function() {
    it('should successfully authneticate with correct auth token', function(done) {
      createServer('/auth-success', talk(auth, function(t, client) {
        client.name.should.equal('test');
        t.emitter().emit('greeting', 'Welcome ' + client.name);
      }));
      
      var sock = createClient('/auth-success', AUTH_TOKEN);
      
      sock.emitter().on('greeting', function(message) {
        message.should.equal('Welcome test');
        sock.close();
        done();
      });
    });
    
    it('should drop connection if token is not correct', function(done) {
      var passed = false;
      createServer('/auth-fail', talk(auth, function(t, client) {
        passed = true;
      }));
      
      var sock = createClient('/auth-fail', 'wrong-token');
      
      setTimeout(function() {
        passed.should.equal(false);
        sock.close();
        done();
      }, 100);
    });
    
    it('should bypass auth if not auth function provided', function(done) {
      createServer('/auth-bypass', talk(function(t, client) {
        should.not.exist(client);
        sock.close();
        done();
      }));
      
      var sock = createClient('/auth-bypass');
    });
  });
  
  describe('emitter', function() {
    it('should receive events from clients', function(done) {
      createServer('/emitter', talk(function(t) {
        var emitter = t.emitter();
        emitter.on('log', function(message) {
          message.should.equal('hello world');
          sock.close();
          done();
        });
      }));
      
      var sock = createClient('/emitter');
      var em = sock.emitter();
      em.emit('log', 'hello world');
    });
    
    it('should emit events to clients', function(done) {
      createServer('/emitter2', talk(function(t) {
        t.emitter().emit('piu', 1, 2, 3);
      }));
      
      var sock = createClient('/emitter2');
      
      sock.emitter().on('piu', function(a, b, c) {
        a.should.equal(1);
        b.should.equal(2);
        c.should.equal(3);
        sock.close();
        done();
      });
    });
    
    it('should support namespaces', function(done) {
      createServer('/emitter3', talk(function(t) {
        t.emitter('namespace').emit('event');
      }));
      
      var sock = createClient('/emitter3');
      var sock2 = createClient('/emitter3');
      
      sock.emitter().on('event', function(a, b, c) {
        throw new Error('should not catch this event');
      });
      
      sock2.emitter('namespace').on('event', function() {
        sock.close();
        sock2.close();
        done();
      });
    });
    
    it('should emit disconnect when client disconnected', function(done) {
      createServer('/emitter4', talk(function(t) {
        t.emitter().on('disconnect', done);
      }));
      
      var sock = createClient('/emitter4');
      
      setTimeout(function(){ 
        sock.close();
      }, 100);
    });
  });
  
  describe('rpc', function() {
    it('should successfully call a method', function(done) {
      createServer('/rpc', talk(function(t) {
        t.rpc(api);
      }));
      
      var sock = createClient('/rpc');
      
      sock.rpc().call('increment', 1, function(err, result) {
        should.not.exist(err);
        result.should.equal(2);
        sock.close();
        done();
      });
    });
    
    it('should get an error in a callback', function(done) {
      createServer('/rpc2', talk(function(t) {
        t.rpc(api);
      }));
      
      var sock = createClient('/rpc2');
      
      sock.rpc().call('increment', false, function(err, result) {
        err.should.equal('n should be a number');
        should.not.exist(result);
        sock.close();
        done();
      });
    });
    
    it('should get an error in method is missing', function(done) {
      createServer('/rpc3', talk(function(t) {
        t.rpc(api);
      }));
      
      var sock = createClient('/rpc3');
      
      sock.rpc().call('decrement', 2, function(err, result) {
        err.should.equal('method missing');
        should.not.exist(result);
        sock.close();
        done();
      });
    });
    
    it('should support namespaces', function(done) {
      createServer('/rpc4', talk(function(t) {
        t.rpc('math', api);
      }));
      
      var sock = createClient('/rpc4');
      var sock2 = createClient('/rpc4');
      
      sock2.rpc('math').call('increment', 2, function(err, result) {
        should.not.exist(err);
        result.should.equal(3);
        sock2.close();
        
        sock.rpc().call('increment', 2, function(err, result) {
          throw new Error('should not trigger');
        });
        
        setTimeout(function() {
          sock.close();
          done();
        }, 100);
      });
    });
    
    it('should support invokation timeout', function(done) {
      createServer('/rpc5', talk(function(t) {
        t.rpc('long', {
          hello: function(cb) {
            setTimeout(cb, 500);
          }
        });
      }));
      
      var sock = createClient('/rpc5');
      
      sock.rpc('long', 300).call('hello', function(err, result) {
        err.should.be.an('error');
        err.message.should.equal('timeout');
        sock.close();
        done();
      });
    });
  });
  
  describe('pubsub', function() {
    it('should continuously publish data to clients', function(done) {
      
      createServer('/pubsub', talk(function(t) {
        var data = [1,2,3,4];
        t.pubsub().publish('count', function(params, context, sub) {
          params.should.deep.equal([]);
          var id = setInterval(function() {
            sub.update(data.shift());
          }, 10);
          sub.onClose(function() {
            clearInterval(id);
            done();
          });
        });
      }));
      
      var sock = createClient('/pubsub');
      var sub = sock.pubsub().subscribe('count');
      var current = 1;
      sub.onUpdate(function(val) {
        val.should.equal(current);
        current++;
        if (val === 4) {
          sub.close();
        }
      });
    });
  });
  
  describe('connection', function() {
    it('should drop client connection on server error', function(done) {
      createServer('/test', talk(function(t) {
        t.emitter().on('hello', function() {
          var x = {};
          x.x = x;
          t.emitter().emit('this should drop client connection', x);
        });
      }));
    
      var sock = createClient('/test');
      sock.emitter().emit('hello');
      
      setTimeout(function(){
        sock.connected().should.equal(false);
        sock.close();
        done();
      }, 100);      
    });
    
    it('should drop server connection on client error', function(done) {
      createServer('/test2', talk(function(t) {
        setTimeout(function() { 
          t.connected().should.equal(false);
          done();
        }, 100);
      }));
    
      var sock = createClient('/test2');
      
      setTimeout(function() {
        sock.close();
      }, 10);
    });
    
    it('should reconnect client connection on server error', function(done) {
      var sock = createClient('/test');
      sock.emitter().emit('hello');

      setTimeout(function(){
        sock.connected().should.equal(false);
        setTimeout(function() {
          sock.connected().should.equal(true);
          done();
        }, 1000);
      }, 100);
    });
  });
});