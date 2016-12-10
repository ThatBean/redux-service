# Redux-Service [![npm](https://img.shields.io/npm/v/redux-service.svg)](https://www.npmjs.com/package/redux-service) [![npm](https://img.shields.io/npm/dm/redux-service.svg)](https://www.npmjs.com/package/redux-service)

[Middleware](http://redux.js.org/docs/advanced/Middleware.html) for [Redux](http://redux.js.org/).

Offers a experimental way to handle `(highly mutable || remote) data source && async logic` in Redux.

It's best to put all data you need inside the Redux State, and update in a Immutable way.
But there are times the data you get just won't fit (**remote**), or best updated **Mutable**.
And the logic & action for those data often need to be **async**.

#### Document

Check this [GitBook](https://thatbean.gitbooks.io/redux-service/content/) for API and Usage.
Or check the Source Code directly at [GitHub](https://github.com/ThatBean/redux-service).
(It's not that complex)

It's best if you're familiar with the following:
 - [Redux](http://redux.js.org/)
 - [ReduxMiddleware: Redux-Thunk](https://www.npmjs.com/package/redux-thunk)
 - [ReduxMiddleware: Redux-Saga](https://www.npmjs.com/package/redux-saga)
 - [JavaScript: Generator](http://redux.js.org/docs/advanced/Middleware.html)

#### License

[MIT](https://wikipedia.org/wiki/MIT_License).
Issues and Pull Requests are welcomed.
