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
const TO_BOOL_MAP = (sourceList) => [].concat(sourceList).reduce((o, v) => { o[ v ] = true; return o }, {})

class LiteCSP {
  constructor (name) {
    this.name = name
    this.generator = null
    this.observer = null // a observer Function
    this.isActive = false
    this.requestMap = {} // Map: { actionType: true }
    this.respond = DEFAULT_RESPOND
    this.inputAction = null
    this.contextObject = {
      req: (actionTypeList) => { this.requestMap = TO_BOOL_MAP(actionTypeList) },
      res: (action) => { this.respond = { done: false, value: action } }
    }
  }

  linkGenerator (generatorFunction, contextObject) {
    this.generator = generatorFunction({ ...this.contextObject, ...contextObject })
    this.generatorNext = (action) => {
      this.respond = DEFAULT_RESPOND
      if (this.isActive) this.isActive = (this.generator.next(action).done === false)
    }
  }

  linkObserver (observer) {
    this.observer = observer
  }

  start (action) {
    if (this.isActive) return
    this.isActive = true
    this.next(action)
  }

  input (action) {
    if (!this.isActive || !this.requestMap[ action.type ]) return false
    if (this.inputAction) console.warn(`[ReduxService] re-entry of [${this.name}], already with: ${this.inputAction.type}, new action: ${action.type}`)
    this.inputAction = action
    this.next(action)
    this.inputAction = null
    return true // Block Action
  }

  next (action) {
    this.generatorNext(action)
    while (this.observer && this.isActive && !this.respond.done) { // process follow up res by calling next till a req
      this.observer(this.respond.value)
      !this.respond.done && this.generatorNext(action)
    }
  }

  stop (action) {
    if (!this.isActive) return
    this.generator.return(action)
    this.isActive = false
    this.requestMap = {}
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
    this.bindMap = {} // bind method to this[key] & this.bindMap[key]
    BIND_KEY_LIST.forEach((key) => ( this[ key ] = this.bindMap[ key ] = this[ key ].bind(this) ))
  }

  middleware (store) {
    this.store = store
    return (next) => action => this.onAction(action) || next(action) // if Action Block, skip next()
  }

  setEntry (actionType, entryFunction) {
    if (this.entryMap[ actionType ]) console.warn('[ReduxService] possible unexpected entry overwrite:', actionType, entryFunction)
    this.entryMap[ actionType ] = entryFunction
  }

  setService (serviceName, serviceGeneratorFunction) {
    if (this.serviceGeneratorFunctionMap[ serviceName ]) console.warn('[ReduxService] possible unexpected service overwrite:', serviceName, serviceGeneratorFunction)
    this.serviceGeneratorFunctionMap[ serviceName ] = serviceGeneratorFunction
  }

  startService (serviceName) {
    const serviceGeneratorFunction = this.serviceGeneratorFunctionMap[ serviceName ]
    if (!serviceGeneratorFunction) return console.warn('[ReduxService] service not found:', serviceName)
    if (this.serviceMap[ serviceName ]) return console.warn('[ReduxService] service already started:', serviceName)
    const service = new LiteCSP(serviceName)
    service.linkGenerator(serviceGeneratorFunction, { store: this.store, ...this.bindMap })
    service.linkObserver((action) => this.store.dispatch(action))
    service.start()
    if (!service.isActive) return console.warn('[ReduxService] service failed to start:', serviceName)
    this.serviceMap[ serviceName ] = service
  }

  startAllService () {
    for (const serviceName in this.serviceGeneratorFunctionMap) {
      if (!this.serviceMap[ serviceName ]) this.startService(serviceName)
    }
  }

  stopService (serviceName, action) {
    const service = this.serviceMap[ serviceName ]
    if (!service) return
    service.stop(action)
    delete this.serviceMap[ serviceName ]
  }

  onAction (action) {
    if (!this.store) return console.warn(`[ReduxService] get Action before Store is set, strange. Action Type: ${action.type}`)

    const entry = this.entryMap[ action.type ]
    if (entry) { // console.log('[ReduxService] Entry:', action.type)
      const isBlock = entry(this.store, action)
      if (isBlock) return true // if isBlock, follow up service || middleware || reducers will not receive this Action
    }

    for (const serviceName in this.serviceMap) {
      const service = this.serviceMap[ serviceName ]
      if (service.input(action)) {
        // !service.isActive && console.log('[ReduxService] service stopped:', service.name)
        if (!service.isActive) delete this.serviceMap[ service.name ]
        return true // always Block Action here
      }
    }

    return false // Action not Blocked
  }
}

// the session Object Appears to be 'Immutable', but not necessarily the Array or Object inside
function createSessionReducer (actionType, sessionObject) {
  const initialState = { ...sessionObject, _tick: 0 }
  return (state = initialState, action) => {
    if (action.type === actionType) return { ...state, ...action.payload, _tick: state._tick + 1 }
    else return state
  }
}

export {
  ReduxService, // for multi instance
  createSessionReducer
}

export default ReduxService