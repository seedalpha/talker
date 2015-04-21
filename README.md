# talker

messaging patterns for streams on client and server

### Installation

  $ npm install seed-talker --save

### Usage

Check `example`

client.js
```javascript
var talk = require('seed-talker');
var shoe = require('shoe');

// connect and (optinally) authenticate
var remote  = talk(shoe('/talk'), 'my-auth-token');

// remote event emitter api
var emitter = remote.emitter();

emitter.on('echo', function(msg) {
  console.log(msg); // 'Hello'
});

emitter.emit('echo', 'Hello');

// remote procedure calling api
var rpc = remote.rpc();

rpc.call('sum', 2, 2, function(err, result) {
  console.log(err, result); // null, 4
});

rpc.call('hello', function(err, result) {
  console.log(err, result); // null, 'Hello, John'
});
```

server.js
```javascript
var http = require('http');
var talk = require('seed-talker');
var shoe = require('shoe');

var server = http.createServer();

// authenticate
var auth = function(token, cb) {
  if (token === 'my-auth-token') {
    cb(null, { name: 'John' });
  }
}

// second function is called on client connect
shoe(talk(auth, function(t) {

  // remote event emitter api
  var events = t.emitter();

  events.on('echo', function(msg) {
    events.emit('echo', msg);
  });

  // remote procedure calling api
  var rpc = t.rpc({
    sum: function(a, b, cb) {
      cb(null, a + b);
    },
    hello: function(cb) {
      cb(null, 'Hello, ' + this.client.name);
    }
  });

})).install(server, '/talk');

server.listen(50000, function() {
  console.log('Server is listening on port 50000');
});
```

### TODO

- document `namespaces`
- tests
- coverage

### Author

Vladimir Popov <vlad@seedalpha.net>

### License

©2015 SeedAlpha
