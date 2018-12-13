var http        = require('http');
var talk        = require('../');
var ws          = require('websocket-stream');
var talkClient  = require('../lib/talker/client');
var server      = http.createServer();
var should      = require('chai').should();

server.setMaxListeners(20);

function createServer(path, api) {
  ws.createServer({
    server: server,
    path: path
  }, api.handle);
}

function createClient(path, token) {
  return talkClient(
    null,
    function() {
      return ws('ws://localhost:50005' + path);
    },
    token
  );
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
      createServer('/auth-success', talk(
          null,
          function(t, client) {
            client.name.should.equal('test');
            t.emitter().emit('greeting', 'Welcome ' + client.name);
          },
          auth
        )
      );
      
      var sock = createClient('/auth-success', AUTH_TOKEN);
      sock.emitter().on('greeting', function(message) {
        message.should.equal('Welcome test');
        sock.close();
        done();
      });
    });
    
    it('should drop connection if token is not correct', function(done) {
      var passed = false;
      createServer('/auth-fail', talk(
          null,
          function(t, client) {
            passed = true;
          },
          auth
        )
      );
      
      var sock = createClient('/auth-fail', 'wrong-token');
      
      setTimeout(function() {
        passed.should.equal(false);
        sock.close();
        done();
      }, 100);
    });
    
    it('should bypass auth if not auth function provided', function(done) {
      createServer('/auth-bypass', talk(
        null, 
        function(t, client) {
          should.not.exist(client);
          sock.close();
          done();
        })
      );
      
      var sock = createClient('/auth-bypass');
    });
  });
  
  describe('emitter', function() {
    it('should receive events from clients', function(done) {
      createServer('/emitter', talk(
        null,
        function(t) {
          var emitter = t.emitter();
          emitter.on('log', function(message) {
            message.should.equal('hello world');
            sock.close();
            done();
          });
        })
      );
      
      var sock = createClient('/emitter');
      var em = sock.emitter();
      em.emit('log', 'hello world');
    });
    
    it('should emit events to clients', function(done) {
      createServer('/emitter2', talk(
        null,
        function(t) {
          t.emitter().emit('piu', 1, 2, 3);
        })
      );
      
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
      createServer('/emitter3', talk(
        null,
        function(t) {
          t.emitter('namespace').emit('event');
        })
      );
      
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
      createServer('/emitter4', talk(
        null,
        function(t) {
          t.emitter().on('disconnect', done);
        })
      );
      
      var sock = createClient('/emitter4');
      
      setTimeout(function(){ 
        sock.close();
      }, 100);
    });
    
    it('should broadcast to channels', function(done) {
      var joined = false;
      var count = 0;
      createServer('/emitter5', talk(
        null,
        function(t) {
          var chat = t.emitter('chat');
          count++;
          if (!joined) {
            chat.join('room');
            joined = true;
          }
          chat.broadcast('room').emit('message', 'client ' + count + ' joined chat');
        })
      );
      
      var sock  = createClient('/emitter5');
      var sock2 = createClient('/emitter5');
      
      var received = 0;
      sock.emitter('chat').on('message', function() {
        received++;
        if (received === 2) {
          done();
        }
      });
      
      sock2.emitter('chat').on('message', function() {
        throw new Error('should not catch this event');
      });
    });
    
    it('should optionally exclude self during broadcast', function(done) {
      createServer('/emitter6', talk(
        null,
        function(t) {
          t.emitter('chat')
          .join('room1', 'room2')
          .broadcast(['room1', 'room2'], { excludeSelf: true })
          .emit('message', 'hello world');
        })
      );
      
      var received = 0;
      
      function onMessage(msg) {
        msg.should.equal('hello world');
        received++;
        if (received === 3) {
          done();
        }
      }
      
      createClient('/emitter6').emitter('chat').on('message', onMessage);
      createClient('/emitter6').emitter('chat').on('message', onMessage);
      createClient('/emitter6').emitter('chat').on('message', onMessage);
    });
    
    it('should join and leave channels dynamically', function(done) {
      var state = ['red', 'yellow', 'green'];
      var count = 0;
      
      createServer('/emitter7', talk(
        null,
        function(t) { 
          var emitter = t.emitter('semaphore')
            .join(state[0]);
          
          emitter.on('switch', function() {
            var prev = state[count % state.length];
            count++;
            var next = state[count % state.length];
            
            emitter.broadcast(prev).emit('left', prev);
            emitter.leave(prev).join(next);
            emitter.broadcast(next).emit('entered', next);
          });
        })
      );
      
      var localState = null;
      var localPrevState = null;
      var messagesReceived = 0;
      var em = createClient('/emitter7').emitter('semaphore');
      
      em.on('left', function(data) {
        state[(count - 1) % state.length].should.equal(data);
        localPrevState = data;
        messagesReceived++;
      });
      
      em.on('entered', function(data) {
        state[count % state.length].should.equal(data);
        localState = data;
        messagesReceived++;
      });
      
      em.emit('switch');
      
      setTimeout(function() {
        em.emit('switch');
      }, 10);
      
      setTimeout(function() {
        localState.should.equal('green');
        localPrevState.should.equal('yellow');
        messagesReceived.should.equal(4);
        done();
      }, 200);
    });
    
    it('should broadcast to connected clients via server', function(done) {
      
      var api = talk(
        null,
        function(t) {
          t.emitter('bus').join('podcast');
        }
      );
      
      var called = 0;
      
      function onMessage(text) {
        text.should.equal('world');
        called++;
        if (called === 3) {
          done();
        }
      }
      
      createServer('/emitter8', api);
      createClient('/emitter8').emitter('bus').on('hello', onMessage);
      createClient('/emitter8').emitter('bus').on('hello', onMessage);
      createClient('/emitter8').emitter('bus').on('hello', onMessage);
      setTimeout(function() {
        var emitter = api.emitter('bus');
        emitter.broadcast('podcast').emit('hello', 'world');
      }, 50);
    });
  });
  
  
  
  describe('rpc', function() {
    it('should successfully call a method', function(done) {
      createServer('/rpc', talk(
        null,
        function(t) {
          t.rpc(api);
        })
      );
      
      var sock = createClient('/rpc');
      
      sock.rpc().call('increment', 1, function(err, result) {
        should.not.exist(err);
        result.should.equal(2);
        sock.close();
        done();
      });
    });
    
    it('should get an error in a callback', function(done) {
      createServer('/rpc2', talk(
        null,
        function(t) {
          t.rpc(api);
        })
      );
      
      var sock = createClient('/rpc2');
      
      sock.rpc().call('increment', false, function(err, result) {
        err.should.equal('n should be a number');
        should.not.exist(result);
        sock.close();
        done();
      });
    });
    
    it('should get an error in method is missing', function(done) {
      createServer('/rpc3', talk(
        null,
        function(t) {
          t.rpc(api);
        })
      );
      
      var sock = createClient('/rpc3');
      
      sock.rpc().call('decrement', 2, function(err, result) {
        err.should.equal('method missing');
        should.not.exist(result);
        sock.close();
        done();
      });
    });
    
    it('should support namespaces', function(done) {
      createServer('/rpc4', talk(
        null,
        function(t) {
          t.rpc('math', api);
        })
      );
      
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
      createServer('/rpc5', talk(
        null,
        function(t) {
          t.rpc('long', {
            hello: function(cb) {
              setTimeout(cb, 500);
            }
          });
        })
      );
      
      var sock = createClient('/rpc5');
      
      sock.rpc('long', 300).call('hello', function(err, result) {
        err.should.be.an('error');
        err.message.should.equal('timeout');
        sock.close();
        done();
      });
    });
    
    it('should support context', function(done) {
      createServer('/rpc6', talk(
        null,
        function(t) {
          t.rpc({
            version: function(cb) {
              cb(null, this.version);
            }
          }, {
            version: '1.0.0'
          });
        })
      );
      
      var sock = createClient('/rpc6');
      
      sock.rpc().call('version', function(err, result) {
        should.not.exist(err);
        result.should.equal('1.0.0');
        sock.close();
        done();
      });
    });
  });
  
  describe('pubsub', function() {
    it('should continuously publish data to clients', function(done) {
      
      createServer('/pubsub', talk(
        null,
        function(t) {
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
        })
      );
      
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
      createServer('/test', talk(
        null,
        function(t) {
          t.emitter().on('hello', function() {
            var x = {};
            x.x = x;
            t.emitter().emit('this should drop client connection', x);
          });
        })
      );
    
      var sock = createClient('/test');
      sock.emitter().emit('hello');
      
      setTimeout(function(){
        sock.connected().should.equal(false);
        sock.close();
        done();
      }, 100);      
    });
    
    it('should drop server connection on client error', function(done) {
      createServer('/test2', talk(
        null,
        function(t) {
          setTimeout(function() { 
            t.connected().should.equal(false);
            done();
          }, 100);
        })
      );
      
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