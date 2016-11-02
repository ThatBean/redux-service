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

const DEFAULT_RESPOND = { done: true, value: null }

class LiteCSP {
  constructor (type) {
    this.type = type
    this.generator = null
    this.observer = null // a observer Function
    this.running = false
    this.isEnteredInput = false
    this.expect = {} // key - true
    this.respond = DEFAULT_RESPOND

    this.contextObject = {
      req: (keyList) => { // console.log('- REQ', this.type, keyList)
        this.expect = [].concat(keyList).reduce((o, v) => {
          o[ v ] = true
          return o
        }, {})
      },
      res: (data) => { // console.log('- RES', this.type, data.type)
        this.respond = { done: false, value: data }
      }
    }
  }

  linkGenerator (generatorFunction, contextObject) {
    this.generator = generatorFunction({ ...this.contextObject, ...contextObject })
    this.generatorNext = (data) => {
      this.respond = DEFAULT_RESPOND
      if (this.running) this.running = (this.generator.next(data).done === false)
    }
  }

  linkObserver (observer) {
    this.observer = observer
  }

  start (data) {
    if (this.running) return
    this.running = true
    this.next(data)
  }

  input (key, data) {
    let isBlock = false
    if (this.running && this.expect[ key ]) {
      if (this.isEnteredInput) console.error(`[ReduxService][LiteCSP] unexpected re-entry of ${this.type}, key: ${key}`)
      else this.isEnteredInput = true
      this.next(data)
      this.isEnteredInput = false
      isBlock = true
    }
    return isBlock
  }

  next (data) {
    // console.log('>>>> NEXT', this.type, data)
    this.generatorNext(data)
    while (this.observer && this.running && !this.respond.done) { // process follow up res by calling next till a req
      this.observer(this.respond.value)
      !this.respond.done && this.generatorNext(data)
    }
    // console.log('>>>> NEXT', this.type, data)
  }

  stop (data) {
    if (!this.running) return
    this.generator.return(data)
    this.running = false
    this.expect = {}
  }
}

/**
 * mental structure:
 *   Redux
 *     ReduxService.middleware
 *       Entry (Your Customized Function)
 *       Service Wrapper (LiteCSP)
 *         Service (Your Customized Generator) { req, res }
 */
const BIND_KEY_LIST = [
  'middleware',
  'setEntry',
  'setService',
  'startService',
  'startAllService',
  'stopService'
]

class ReduxService {
  constructor () {
    this.store = null
    this.entryMap = {} // actionType - serviceEntryFunction
    this.serviceMap = {} // serviceType - LiteCSP
    this.serviceGeneratorFunctionMap = {}

    // bind method to this[key] & this.bindMap[key]
    this.bindMap = {}
    BIND_KEY_LIST.forEach((key) => ( this[ key ] = this.bindMap[ key ] = this[ key ].bind(this) ))
  }

  middleware (store) {
    this.setStore(store)
    return (next) => action => this.onAction(action) || next(action) // pick this action from the reducer
  }

  setStore (store) { this.store = store }

  setEntry (type, entryFunction) {
    if (this.entryMap[ type ]) console.warn('[ReduxService] possible unexpected entry overwrite:', type, entryFunction)
    this.entryMap[ type ] = entryFunction
  }

  setService (type, serviceGeneratorFunction) {
    if (this.serviceGeneratorFunctionMap[ type ]) console.warn('[ReduxService] possible unexpected service overwrite:', type, serviceGeneratorFunction)
    this.serviceGeneratorFunctionMap[ type ] = serviceGeneratorFunction
  }

  startService (type) {
    const serviceGeneratorFunction = this.serviceGeneratorFunctionMap[ type ]
    if (!serviceGeneratorFunction) return console.warn('[ReduxService] service not found:', type)
    if (this.serviceMap[ type ]) return console.warn('[ReduxService] service already started:', type)
    const service = new LiteCSP(type)
    service.linkGenerator(serviceGeneratorFunction, {
      store: this.store,
      ...this.bindMap
    })
    service.linkObserver((...args) => { // console.log('linkObserver', ...args)
      return this.store.dispatch(...args)
    })
    service.start()
    if (!service.running) return console.warn('[ReduxService] service failed to start:', type)
    this.serviceMap[ type ] = service
  }

  startAllService () {
    for (const type in this.serviceGeneratorFunctionMap) !this.serviceMap[ type ] && this.startService(type)
  }

  stopService (type) {
    const service = this.serviceMap[ type ]
    if (!service) return
    service.stop()
    delete this.serviceMap[ service.type ]
  }

  onAction (action) {
    if (!this.store) console.warn('[ReduxService] caught action before store configured:', action)

    const entry = this.entryMap[ action.type ]
    if (entry) { // console.log('[ReduxService] Entry:', action.type)
      const isBlock = entry(this.store, action)
      if (isBlock) return true // if the entry return true, follow up middleware & reducers will be blocked
    }

    for (const type in this.serviceMap) {
      const service = this.serviceMap[ type ]
      if (service.input(action.type, action)) {
        // !service.running && console.log('[ReduxService] service stopped:', service.type)
        if (!service.running) delete this.serviceMap[ service.type ]
        return true // always block
      }
    }

    return false // if the entry return true, follow up middleware & reducers will be blocked
  }
}

// the session Object Appears to be 'Immutable', but not necessarily the Array or Object inside
function createSessionReducer (actionType, session) {
  const initialState = { ...session, _tick: 0 }
  return (state = initialState, action) => {
    if (action.type === actionType) return { ...state, ...action.payload, _tick: state._tick + 1 }
    else return state
  }
}

export {
  ReduxService, // for manually create new instance
  createSessionReducer
}

export default {
  ReduxService, // for manually create new instance
  createSessionReducer
}