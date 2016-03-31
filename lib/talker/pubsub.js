var EventEmitter = require('events').EventEmitter;

function pubsub(context, emitter) {
  if (!(this instanceof pubsub)) {
    return new pubsub(context, emitter);
  }
  
  this._pubs = {};
  this._subs = {};
  this._context = context;
  this._emitter = emitter;
  
  emitter.on('unsub', function(subId) {
    var sub = this._subs[subId];
    
    if (!sub) {
      console.log('trying to close nonexistent subscription', subId);
      return;
    }
    
    if (!sub.close) {
      throw new Error('trying to close subscription without a hook');
    }
    
    sub.close();
  }.bind(this));
  
  emitter.on('sub', function(sub) {
    this._subs[sub.id] = sub;
    var pub = this._pubs[sub.name];
    
    if (!pub) {
      console.log('publishing not found:', sub.name);
      return;
    }
    
    pub.call(pub, sub.args, context, {
      update: function(data) {
        emitter.emit('sub' + sub.id, data);
      },
      onClose: function(fn) {
        sub.close = fn;
      }
    });    
  }.bind(this));
}

/**
 * Publish
 *
 * @param {Object|String} name
 * @param {Function} fn(args, context, sub)
 * @return {pubsub} self
 */

pubsub.prototype.publish = function(name, fn) {
  if (typeof name === 'string') {
    this._pubs[name] = fn;
  } else {
    for (var key in name) {
      this._pubs[key] = name[key];
    }
  }
  return this;
}

/**
 * Subscribe
 *
 * @param {String} name
 * @params...
 * @return {Object} sub
 *   @param {Function} onUpdate
 *   @param {Function} close
 */

pubsub.prototype.subscribe = function(name) {
  var args = [].slice.call(arguments, 1);
  
  var sub = { 
    name: name,
    args: args,
    id: Date.now() + Math.random()
  };
  
  var listeners = [];
  var emitter = this._emitter;
  
  emitter.on('sub' + sub.id, function (data) {
    if (!sub.update) return console.log('publishing to subscription without a hook', sub.name);
    sub.update(data);
  });
  
  emitter.emit('sub', sub);
  
  return {
    onUpdate: function(fn) {
      sub.update = fn;
    },
    close: function() {
      emitter.emit('unsub', sub.id);
      emitter.removeAllListeners('sub' + sub.id);
    }
  };
}

/**
 * Close all subscriptions
 */

pubsub.prototype.close = function() {
  Object.keys(this._subs).forEach(function(sub) {
    sub.close();
  });
  this.emitter.removeAllListeners();
  this._subs = null;
  this._pubs = null;
}

/**
 * Expose
 */

exports = module.exports = pubsub;