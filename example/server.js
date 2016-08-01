var http      = require('http');
var express   = require('express');
var enchilada = require('enchilada');
var talk      = require('../');
var app       = express();
var shoe      = require('shoe');
var fs        = require('fs');

app.use(enchilada(__dirname));
app.use(express.static(__dirname));

var server = http.createServer(app);

shoe(talk(function(token, cb) {
  if (token === '12345') {
    cb(null, { name: 'John' });
  } else {
    cb('Access Denied');
  }
}, function(t, client) {
  
  var events = t.emitter();

  events.on('ping', function() {
    events.emit('pong');
  });

  events.on('echo', function(msg) {
    events.emit('echo', msg);
  });

  var rpc = t.rpc({
    hello: function(cb) {
      cb(null, 'Hello ' + client.name);
    },
    sum: function(a,b, cb) {
      cb(null, a + b);
    }
  });
  
}).handle).install(server, '/talk');

server.listen(50000, function() {
  console.log('Server is listening on port 50000');
});