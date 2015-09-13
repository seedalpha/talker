# talker

Simplified client/server communication, using websockets

### Changelog

`3.0.0`:

- major rewrite
- purge stream api
- tests & coverage
- emitters fire 'disconnect' when client closes connection

`2.0.2`:

- handle auth errors

`2.0.1`:

- don't pre parse auth tokens

`2.0.0`:

- add client reconnect (api changes)
- add support duplex streams
- add streams examples
- add expose client on `connection` event
- add cleanup listeners to prevent memory leaks
- fix server auth lock (had to be resumed with empty message)

`1.0.0`:

- Initial release

### Usage

Check `example`

#### Connect

client
```javascript
var talk = require('talker');
var shoe = require('shoe');

// will be called everytime connection is broken
function getStream() {
  return shoe('/api');
}

// connect
var remote = talk(getStream);

// alternatively connect using auth-token
var secure = talk(getStream, 'my-secret-auth-token');
```

server
```javascript
var http = require('http');
var talk = require('talker');
var shoe = require('shoe');

var server = http.createServer();

// authenticate
function auth(token, cb) {
  if (token === 'my-secret-auth-token') {
    cb(null, { id: 123, name: 'John', role: 'admin' });
  }
}

// on client connected
function onConection(remote, client) {
  // client.id === 123
  // application logic here...
}

// accept connections
shoe(talk(onConnection)).install(server, '/api');

// alternatively accept connections and authenticate clients
shoe(talk(auth, onConnection)).install(server, '/secure');

server.listen(5000);
```

#### EventEmitter API

client
```javascript

// create emitter
var emitter = remote.emitter();

// listen on events from server
emitter.on('echo', function(msg) {
  console.log(msg); // 'Hello'
});

// emit events to server
emitter.emit('echo', 'Hello');

// create namespaced emitter
var chat = remote.emitter('chat');

chat.on('message', function(message) {
  //...
});
```

server
```javascript

function onConnection(remote, client) {
  var emitter = remote.emitter();

  emitter.on('echo', function(msg) {
    emitter.emit('echo', msg);
  });

  var chat = remote.emitter('chat');

  chat.emit('message', 'Hi there!');
}
```

#### RPC API

client
```javascript

// create default rpc
var rpc = remote.rpc();

rpc.call('sum', 2, 2, function(err, result) {
  console.log(err, result); // null, 4
});

// create namespaced rpc
var users = remote.rpc('users');

users.call('create', { name: 'Peter' }, function(err, user) {
  // ...
});
```

server
```javascript

function onConnection(remote, client) {

  // default
  var rpc = remote.rpc({
    sum: function(a, b, cb) {
      cb(null, a + b);
    }
  });

  // namespaced
  var users = remote.rpc('users', {
    create: function(object, cb) {
      // do stuff ...
      cb(null, user);
    }
  })
}
```

### Author

Vladimir Popov <vlad@seedalpha.net>

### License

©2015 SeedAlpha
