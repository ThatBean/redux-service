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
      req: (keyList) => {
        // console.log('- REQ', this.type, keyList)
        this.expect = [].concat(keyList).reduce((o, v) => {
          o[ v ] = true
          return o
        }, {})
      },
      res: (data) => {
        // console.log('- RES', this.type, data.type)
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
      if (this.isEnteredInput) throw new Error(`[ReduxService][LiteCSP] unexpected re-entry of ${this.type}, key: ${key}`)
      this.isEnteredInput = true
      this.next(data)
      this.isEnteredInput = false
      isBlock = true
    }
    return isBlock
  }

  next (data) {
    this.generatorNext(data)
    while (this.observer && this.running && !this.respond.done) { // process follow up res by calling next till a req
      this.observer(this.respond.value)
      !this.respond.done && this.generatorNext(data)
    }
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
 *   ReduxMiddleware
 *     ReduxService
 *       Entry
 *       LiteCSP { start, input, next, stop }
 *         service(generator) { req, res }
 */
class ReduxService {
  constructor () {
    this.store = null
    this.entryMap = {} // actionType - serviceEntryFunction
    this.serviceMap = {} // serviceType - LiteCSP
    this.serviceGeneratorFunctionMap = {}
  }

  setStore (store) { this.store = store }

  setEntry (type, entry) {
    if (this.entryMap[ type ]) console.warn('[ReduxService] possible unexpected entry overwrite:', type, entry)
    this.entryMap[ type ] = entry
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
    service.linkGenerator(serviceGeneratorFunction, { store: this.store })
    service.linkObserver((...args) => {
      // console.log('observer', ...args)
      return this.store.dispatch(...args)
    })
    service.start()
    if (!service.running) return console.warn('[ReduxService] service failed to start:', type)
    this.serviceMap[ type ] = service
  }

  startAllService () {
    for (const type in this.serviceGeneratorFunctionMap) !this.serviceMap[ type ] && this.startService(type)
  }

  onAction (action) {
    if (!this.store) console.warn('[ReduxService] caught action before store configured:', action)

    const entry = this.entryMap[ action.type ]
    if (entry) {
      // console.log('[ReduxService] Entry:', action.type)
      const isBlock = entry(this.store, action)
      if (isBlock) return true // if the entry return true, follow up middleware & reducers will be blocked
    }

    for (const type in this.serviceMap) {
      const service = this.serviceMap[ type ]
      if (service.input(action.type, action)) {
        // if (!service.running) console.log('[ReduxService] service stopped:', service.type)
        if (!service.running) delete this.serviceMap[ service.type ]
        return true // always block
      }
    }

    return false // if the entry return true, follow up middleware & reducers will be blocked
  }
}

const Instance = new ReduxService()

const factory = () => ({
  setEntry: Instance.setEntry.bind(Instance),
  setService: Instance.setService.bind(Instance),
  startService: Instance.startService.bind(Instance),
  startAllService: Instance.startAllService.bind(Instance),
  middleware: (store) => {
    Instance.setStore(store)
    return (next) => action => Instance.onAction(action) || next(action) // pick this action from the reducer
  },
  createSessionReducer: (actionType, session) => {
    const initialState = { ...session, _tick: 0 }
    return (state = initialState, action) => {
      if (action.type === actionType) return { ...state, ...action.payload, _tick: state._tick + 1 }
      else return state
    }
  }
})

if (typeof exports === 'object' && typeof module === 'object') module.exports = factory()
else if (typeof define === 'function' && define.amd) define([], factory)
else if (typeof exports === 'object') exports[ 'ReduxService' ] = factory()
else this[ 'ReduxService' ] = factory()
