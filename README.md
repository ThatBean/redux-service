Redux Service
=============

[Middleware](http://redux.js.org/docs/advanced/Middleware.html) for Redux.

Offers a experimental way to handle **(highly mutable || remote) data source && async logic** in Redux

It's best to put all data you need under the Redux state, and update in a immutable way.
But there are times the data you get just won't fit (**remote**), or best updated **mutable**.
And the logic & action for those data often need to be handled **async**.

#### Defining Service
**Service** refers to the combination of data / logic that can not fully put under a Redux standard for:
 - a highly mutable data source
 - a remote data source

A **Service** consists of:
 - service: a GeneratorFunction for logic
 - session: a 'Mutable' Object for data
 - reducer: a custom Redux Reducer that add marks to 'session' and push it to the Redux Store


#### Defining Entry
to better organize the logic, **Entry** is used

**Entry** refers to a thunk-like function used to process a sync or async logic
**Entry** is checked before Service, and Entry can access session as well
**Entry** can be used for:
 - 'inter-service' logic: a Entry for 'res' and dispatch action for another service's 'req'
 - filter: prevent follow up service/reducer from receiving the action

#### Combine use of Service and Entry

when an Action comes through, the processing process will be like:
 - check Entry, if a Entry hit and request Block, the Action will Block here
 - check Service, if a Service hit, the Action will Block here(always Block)
 - send remaining Action to Reducer

`NOTE:
 Do not use the same key for multiple Service, it will Block after the first Service hit.
 Instead, use a Entry to distribute the keys with the benefit of order control`


###### About actionCreatorFunction:
differ from widely used Redux actionCreatorFunction, it's easier to dispatch the actionObject directly by:
 - limit action format to { type: String, payload: Object }
 - use namespace to prefix the actionType, like: 'service:user:login'

###### About serviceGeneratorFunction:
using generator based SCP can make async logic easier to compose
generator will pause at 'yield req(type or typeArray)', wait for expectedAction to come and resume the logic
generator will pause at 'yield res(action)', wait for the action dispatch and followup entry/service/reducer processing, and resume the logic
a expected logic pattern for serviceGenerator is:
 - between 'req', one or more 'res' an be yield to send action back to store for other entry/service/reducer
 - each segment of generator logic is linear, no loop exists between 'req' and 'res' in the same generator
 - all actionTypes used in 'req' are for data input
 - all actionTypes used in 'res' are for data output


## License

MIT
