'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * LiteCSP
 *
 * a lite version of SCP(Communicating sequential processes) with:
 *  - redux store as the only channel
 *  - replace 'put', 'take' with 'res', 'req'
 *  - prevent generator 're-entry':
 *      you should not 'res' and 'req' for the same 'key' in the same generator
 *      meaning the generator.next will not be called on top of the stack of the same generator.next
 *
 * inspired by post: http://jlongster.com/Taming-the-Asynchronous-Beast-with-CSP-in-JavaScript
 * modeled after: https://github.com/ubolonton/js-csp
 */

var DEFAULT_RESPOND = { done: true, value: null };

var LiteCSP = function () {
  function LiteCSP(type) {
    var _this = this;

    _classCallCheck(this, LiteCSP);

    this.type = type;
    this.generator = null;
    this.observer = null; // a observer Function
    this.running = false;
    this.isEnteredInput = false;
    this.expect = {}; // key - true
    this.respond = DEFAULT_RESPOND;

    this.contextObject = {
      req: function req(keyList) {
        // console.log('- REQ', this.type, keyList)
        _this.expect = [].concat(keyList).reduce(function (o, v) {
          o[v] = true;
          return o;
        }, {});
      },
      res: function res(data) {
        // console.log('- RES', this.type, data.type)
        _this.respond = { done: false, value: data };
      }
    };
  }

  _createClass(LiteCSP, [{
    key: 'linkGenerator',
    value: function linkGenerator(generatorFunction, contextObject) {
      var _this2 = this;

      this.generator = generatorFunction(_extends({}, this.contextObject, contextObject));
      this.generatorNext = function (data) {
        _this2.respond = DEFAULT_RESPOND;
        if (_this2.running) _this2.running = _this2.generator.next(data).done === false;
      };
    }
  }, {
    key: 'linkObserver',
    value: function linkObserver(observer) {
      this.observer = observer;
    }
  }, {
    key: 'start',
    value: function start(data) {
      if (this.running) return;
      this.running = true;
      this.next(data);
    }
  }, {
    key: 'input',
    value: function input(key, data) {
      var isBlock = false;
      if (this.running && this.expect[key]) {
        if (this.isEnteredInput) throw new Error('[ReduxService][LiteCSP] unexpected re-entry of ' + this.type + ', key: ' + key);
        this.isEnteredInput = true;
        this.next(data);
        this.isEnteredInput = false;
        isBlock = true;
      }
      return isBlock;
    }
  }, {
    key: 'next',
    value: function next(data) {
      // console.log('>>>> NEXT', this.type, data)
      this.generatorNext(data);
      while (this.observer && this.running && !this.respond.done) {
        // process follow up res by calling next till a req
        this.observer(this.respond.value);
        !this.respond.done && this.generatorNext(data);
      }
      // console.log('>>>> NEXT', this.type, data)
    }
  }, {
    key: 'stop',
    value: function stop(data) {
      if (!this.running) return;
      this.generator.return(data);
      this.running = false;
      this.expect = {};
    }
  }]);

  return LiteCSP;
}();

/**
 * mental structure:
 *   Redux
 *     ReduxService.middleware
 *       Entry (Your Customized Function)
 *       Service Wrapper (LiteCSP)
 *         Service (Your Customized Generator) { req, res }
 */


var BIND_KEY_LIST = ['middleware', 'setEntry', 'setService', 'startService', 'startAllService', 'stopService'];

var ReduxService = function () {
  function ReduxService() {
    var _this3 = this;

    _classCallCheck(this, ReduxService);

    this.store = null;
    this.entryMap = {}; // actionType - serviceEntryFunction
    this.serviceMap = {}; // serviceType - LiteCSP
    this.serviceGeneratorFunctionMap = {};

    // bind method to this[key] & this.bindMap[key]
    this.bindMap = {};
    BIND_KEY_LIST.forEach(function (key) {
      return _this3[key] = _this3.bindMap[key] = _this3[key].bind(_this3);
    });
  }

  _createClass(ReduxService, [{
    key: 'middleware',
    value: function middleware(store) {
      var _this4 = this;

      this.setStore(store);
      return function (next) {
        return function (action) {
          return _this4.onAction(action) || next(action);
        };
      }; // pick this action from the reducer
    }
  }, {
    key: 'setStore',
    value: function setStore(store) {
      this.store = store;
    }
  }, {
    key: 'setEntry',
    value: function setEntry(type, entry) {
      if (this.entryMap[type]) console.warn('[ReduxService] possible unexpected entry overwrite:', type, entry);
      this.entryMap[type] = entry;
    }
  }, {
    key: 'setService',
    value: function setService(type, serviceGeneratorFunction) {
      if (this.serviceGeneratorFunctionMap[type]) console.warn('[ReduxService] possible unexpected service overwrite:', type, serviceGeneratorFunction);
      this.serviceGeneratorFunctionMap[type] = serviceGeneratorFunction;
    }
  }, {
    key: 'startService',
    value: function startService(type) {
      var _this5 = this;

      var serviceGeneratorFunction = this.serviceGeneratorFunctionMap[type];
      if (!serviceGeneratorFunction) return console.warn('[ReduxService] service not found:', type);
      if (this.serviceMap[type]) return console.warn('[ReduxService] service already started:', type);
      var service = new LiteCSP(type);
      service.linkGenerator(serviceGeneratorFunction, _extends({
        store: this.store
      }, this.bindMap));
      service.linkObserver(function () {
        var _store;

        // console.log('observer', ...args)
        return (_store = _this5.store).dispatch.apply(_store, arguments);
      });
      service.start();
      if (!service.running) return console.warn('[ReduxService] service failed to start:', type);
      this.serviceMap[type] = service;
    }
  }, {
    key: 'startAllService',
    value: function startAllService() {
      for (var type in this.serviceGeneratorFunctionMap) {
        !this.serviceMap[type] && this.startService(type);
      }
    }
  }, {
    key: 'stopService',
    value: function stopService(type) {
      var service = this.serviceMap[type];
      if (!service) return;
      service.stop();
      delete this.serviceMap[service.type];
    }
  }, {
    key: 'onAction',
    value: function onAction(action) {
      if (!this.store) console.warn('[ReduxService] caught action before store configured:', action);

      var entry = this.entryMap[action.type];
      if (entry) {
        // console.log('[ReduxService] Entry:', action.type)
        var isBlock = entry(this.store, action);
        if (isBlock) return true; // if the entry return true, follow up middleware & reducers will be blocked
      }

      for (var type in this.serviceMap) {
        var service = this.serviceMap[type];
        if (service.input(action.type, action)) {
          // if (!service.running) console.log('[ReduxService] service stopped:', service.type)
          if (!service.running) delete this.serviceMap[service.type];
          return true; // always block
        }
      }

      return false; // if the entry return true, follow up middleware & reducers will be blocked
    }
  }]);

  return ReduxService;
}();

// the session Object Appears to be 'Immutable', but not necessarily the Array or Object inside


function createSessionReducer(actionType, session) {
  var initialState = _extends({}, session, { _tick: 0 });
  return function () {
    var state = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : initialState;
    var action = arguments[1];

    if (action.type === actionType) return _extends({}, state, action.payload, { _tick: state._tick + 1 });else return state;
  };
}

exports.ReduxService = ReduxService;
exports.createSessionReducer = createSessionReducer;
exports.default = {
  ReduxService: ReduxService, // for manually create new instance
  createSessionReducer: createSessionReducer
};
