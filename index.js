class LiteCSP {
  constructor () {
    this.generator = null
    this.observer = null // a observer Function
    this.running = false
    this.expect = {}
  }

  linkGenerator (generatorFunction, contextObject) {
    this.generator = generatorFunction({
      req: (key) => this.expect = [].concat(key).reduce((o, v) => ((o[ v ] = true), o), {}),
      res: (data) => this.observer && this.observer(data),
      ...contextObject
    })
  }

  linkObserver (observer) {
    this.observer = observer
  }

  start (data) {
    if (this.running) return
    this.running = true
    this.next(data)
  }

  next (data) {
    if (!this.running) return
    this.running = this.generator.next(data).done
  }

  stop (data) {
    if (!this.running) return
    this.generator.return(data)
    this.running = false
    this.expect = {}
  }

  input (key, data) {
    if (this.running && this.expect[ key ]) this.next(data)
  }
}

const serviceInstance = new class {
  constructor () {
    this.store = null
    this.entryMap = {} // actionType - serviceEntryFunction
    this.serviceMap = {} // serviceType - LiteCSP
  }

  setStore (store) {
    this.store = store
  }

  setEntry (type, entry) {
    if (this.entryMap[ type ]) console.warn('[ReduxService] possible unpurposed entry overwrite:', type, entry)
    this.entryMap[ type ] = entry
  }

  setService (type, serviceGeneratorFunction) {
    if (this.serviceMap[ type ]) console.warn('[ReduxService] possible unpurposed service overwrite:', type, serviceGeneratorFunction)
    const service = new LiteCSP()
    service.linkGenerator(serviceGeneratorFunction, { store: this.store })
    service.linkObserver(this.store.dispatch)
    service.start()
    if (service.running) this.serviceMap[ type ] = service
  }

  onAction (action) {
    if (!this.store) console.warn('[ReduxService] action before store:', action)
    const entry = this.entryMap[ action.type ]
    if (entry) return entry(this.store, action) || false // if the entry return true, follow up middleware & reducers will be blocked
    const service = this.serviceMap[ action.type ]
    if (service) {
      service.next(action)
      if (!service.running) delete this.serviceMap[ type ]
    }
    return false // if the entry return true, follow up middleware & reducers will be blocked
  }
}

function createSessionReducer (actionType, session) => {
  const initialState = {
    _tick: 0,
    ...session,
  }
  return (state = initialState, action) => {
    switch (action.type) {
      case actionType:
        return {
          _tick: state._tick + 1,
          ...state,
          ...action.payload
        }
      default:
        return state
    }
  }
}

const factory = () => ({
  setEntry: (type, entry) => {
    serviceInstance.setEntry(type, entry)
  },
  setService: (type, serviceGeneratorFunction) => {
    serviceInstance.setService(type, serviceGeneratorFunction)
  },
  middleware: (store) => {
    serviceInstance.setStore(store)
    return (next) => action => serviceInstance.onAction(action) || next(action) // pick this action from the reducer
  },
  createSessionReducer: (actionType, session) => {
    const initialState = {
      _tick: 0,
      ...session
    }
    return (state = initialState, action) => {
      switch (action.type) {
        case actionType:
          return {
            _tick: state._tick + 1,
            ...state,
            ...action.payload
          }
        default:
          return state
      }
    }
  }
})

if (typeof exports === 'object' && typeof module === 'object') module.exports = factory()
else if (typeof define === 'function' && define.amd) define([], factory)
else if (typeof exports === 'object') exports[ 'ReduxService' ] = factory()
else this[ 'ReduxService' ] = factory()