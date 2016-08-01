# talker

Simplified client/server communication, using websockets

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
    var user = { id: 123, name: 'John', role: 'admin' };
    cb(null, user, [user.id]);
  }
}

// on client connected
function onConection(remote, client) {
  // client.id === 123
  // application logic here...
}

// accept connections
shoe(talk(onConnection).handle).install(server, '/api');

// alternatively accept connections and authenticate clients
shoe(talk(auth, onConnection).handle).install(server, '/secure');

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

chat.emit('join', 'myChannel');
```

server
```javascript

function onConnection(remote, client) {
  var emitter = remote.emitter();

  emitter.on('echo', function(msg) {
    emitter.emit('echo', msg);
  });

  var chat = remote.emitter('chat');
  
  // join default channels
  chat
    .join('lobby')
    .broadcast('lobby')
    .emit('message', client.name + ' joined the lobby');
  
  // broadcast to everyone
  chat.on('join', function(channel) {
    chat
      .join(channel)
      .broadcast(channel)
      .emit('message', client.name + ' joined the channel');
  });
  
  // exclude self during broadcast
  chat.on('leave', function(channel) {
    chat
      .leave(channel)
      .broadcast(channel, { excludeSelf: true })
      .emit('message', client.name + ' left the channel');
  });
  
  // route messages to proper channels
  chat.on('message', function(channel, message) {
    chat.broadcast(channel).emit('message', message);
  });
  
  // single delivery of the message 
  // regardless of how many channels 
  // client is subscribed to
  chat
    .join('A', 'B', 'C')
    .broadcast(['A', 'B'])
    .emit('message', 'user X changed his name to Y'); // will be delivered once
  
}

// talker exposes a single object with `#emitter` method that returns emitter
// that only supports `#broadcast` to push messages to connected users

var glob = talker(onConnection);

glob
  .emitter('chat')
  .broadcast('lobby')
  .emit('message', 'Server will reboot soon');
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

  var context = {
    client: client
  };
  
  // default
  var rpc = remote.rpc({
    sum: function(a, b, cb) {
      cb(null, a + b);
    }
  }, context); // context is optional

  // namespaced
  var users = remote.rpc('users', {
    create: function(object, cb) {
      // do stuff ...
      cb(null, user);
    }
  })
}
```

### pubsub API

client
```javascript

// create default pubsub
var ps = remote.pubsub();

// subscribe to `time` channel
var sub = ps.subscribe('time');

// receive updates when `time` changes
sub.onUpdate(function(data) {
  console.log('Time on server:', data);
  
  // close subscription
  sub.close();
});

// create namespaced pubsub
var sync = remote.pubsub('sync');
```

server
```javascript

function onConnection(remote, client) {
  // create default pubsub
  var ps = remote.pubsub();
  
  ps.publish('time', function(args, context, sub) {
    var id = setInterval(function() {
      sub.update((new Date()).toString());
    }, 1000);
    
    sub.onClose(function() {
      clearInterval(id);
    });
  });
}
```

### Author

Vladimir Popov <vlad@seedalpha.net>

### License

MIT