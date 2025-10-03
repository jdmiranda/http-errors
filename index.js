/*!
 * http-errors
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2016 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

var deprecate = require('depd')('http-errors')
var setPrototypeOf = require('setprototypeof')
var statuses = require('statuses')
var inherits = require('inherits')
var toIdentifier = require('toidentifier')

/**
 * Error object pool for common status codes
 * @private
 */
var errorPool = {
  400: [],
  401: [],
  403: [],
  404: [],
  500: []
}

var poolSize = 10 // Max pooled errors per status code

/**
 * Cache for formatted error messages
 * @private
 */
var messageCache = Object.create(null)

/**
 * Module exports.
 * @public
 */

module.exports = createError
module.exports.HttpError = createHttpErrorConstructor()
module.exports.isHttpError = createIsHttpErrorFunction(module.exports.HttpError)

// Populate exports for all constructors
populateConstructorExports(module.exports, statuses.codes, module.exports.HttpError)

/**
 * Get the code class of a status code.
 * @private
 */

function codeClass (status) {
  return Number(String(status).charAt(0) + '00')
}

/**
 * Create a new HTTP Error.
 *
 * @returns {Error}
 * @public
 */

function createError () {
  // so much arity going on ~_~
  var err
  var msg
  var status = 500
  var props = {}
  for (var i = 0; i < arguments.length; i++) {
    var arg = arguments[i]
    var type = typeof arg
    if (type === 'object' && arg instanceof Error) {
      err = arg
      status = err.status || err.statusCode || status
    } else if (type === 'number' && i === 0) {
      status = arg
    } else if (type === 'string') {
      msg = arg
    } else if (type === 'object') {
      props = arg
    } else {
      throw new TypeError('argument #' + (i + 1) + ' unsupported type ' + type)
    }
  }

  if (typeof status === 'number' && (status < 400 || status >= 600)) {
    deprecate('non-error status code; use only 4xx or 5xx status codes')
  }

  if (typeof status !== 'number' ||
    (!statuses.message[status] && (status < 400 || status >= 600))) {
    status = 500
  }

  // Fast path for common errors without custom messages or props
  var hasCustomMsg = msg !== undefined
  var hasProps = false
  for (var k in props) {
    hasProps = true
    break
  }

  if (!err && !hasCustomMsg && !hasProps && errorPool[status]) {
    var pooled = errorPool[status].pop()
    if (pooled) {
      // Reset stack trace lazily - only when accessed
      delete pooled.stack
      return pooled
    }
  }

  // constructor
  var HttpError = createError[status] || createError[codeClass(status)]

  if (!err) {
    // create error
    err = HttpError
      ? new HttpError(msg)
      : new Error(msg || statuses.message[status])
    Error.captureStackTrace(err, createError)
  }

  if (!HttpError || !(err instanceof HttpError) || err.status !== status) {
    // add properties to generic error
    err.expose = status < 500
    err.status = err.statusCode = status
  }

  for (var key in props) {
    if (key !== 'status' && key !== 'statusCode') {
      err[key] = props[key]
    }
  }

  return err
}

/**
 * Return an error to the pool for reuse
 * @private
 */
function releaseError (err) {
  var status = err.statusCode || err.status
  if (errorPool[status] && errorPool[status].length < poolSize) {
    // Clear custom properties
    for (var key in err) {
      if (key !== 'status' && key !== 'statusCode' && key !== 'expose' &&
          key !== 'message' && key !== 'name') {
        delete err[key]
      }
    }
    errorPool[status].push(err)
  }
}

// Export pool management
module.exports.releaseError = releaseError

/**
 * Create HTTP error abstract base class.
 * @private
 */

function createHttpErrorConstructor () {
  function HttpError () {
    throw new TypeError('cannot construct abstract class')
  }

  inherits(HttpError, Error)

  return HttpError
}

/**
 * Create a constructor for a client error.
 * @private
 */

function createClientErrorConstructor (HttpError, name, code) {
  var className = toClassName(name)

  // Cache default message
  var defaultMsg = statuses.message[code]

  function ClientError (message) {
    // create the error object
    var msg = message != null ? message : defaultMsg
    var err = new Error(msg)

    // adjust the [[Prototype]]
    setPrototypeOf(err, ClientError.prototype)

    // Lazy stack trace - defer stack capture using property getter
    var stackValue
    var stackCaptured = false

    // Delete existing stack property first
    delete err.stack

    Object.defineProperty(err, 'stack', {
      enumerable: false,
      configurable: true,
      get: function () {
        if (!stackCaptured) {
          // Capture stack trace on first access
          Error.captureStackTrace(this, ClientError)
          stackValue = this.stack
          stackCaptured = true
          // Replace getter with direct value for performance
          Object.defineProperty(this, 'stack', {
            value: stackValue,
            writable: true,
            configurable: true,
            enumerable: false
          })
        }
        return stackValue
      },
      set: function (value) {
        stackValue = value
        stackCaptured = true
      }
    })

    // redefine the error message
    Object.defineProperty(err, 'message', {
      enumerable: true,
      configurable: true,
      value: msg,
      writable: true
    })

    // redefine the error name
    Object.defineProperty(err, 'name', {
      enumerable: false,
      configurable: true,
      value: className,
      writable: true
    })

    return err
  }

  inherits(ClientError, HttpError)
  nameFunc(ClientError, className)

  ClientError.prototype.status = code
  ClientError.prototype.statusCode = code
  ClientError.prototype.expose = true

  return ClientError
}

/**
 * Create function to test is a value is a HttpError.
 * @private
 */

function createIsHttpErrorFunction (HttpError) {
  return function isHttpError (val) {
    if (!val || typeof val !== 'object') {
      return false
    }

    if (val instanceof HttpError) {
      return true
    }

    return val instanceof Error &&
      typeof val.expose === 'boolean' &&
      typeof val.statusCode === 'number' && val.status === val.statusCode
  }
}

/**
 * Create a constructor for a server error.
 * @private
 */

function createServerErrorConstructor (HttpError, name, code) {
  var className = toClassName(name)

  // Cache default message
  var defaultMsg = statuses.message[code]

  function ServerError (message) {
    // create the error object
    var msg = message != null ? message : defaultMsg
    var err = new Error(msg)

    // adjust the [[Prototype]]
    setPrototypeOf(err, ServerError.prototype)

    // Lazy stack trace - defer stack capture using property getter
    var stackValue
    var stackCaptured = false

    // Delete existing stack property first
    delete err.stack

    Object.defineProperty(err, 'stack', {
      enumerable: false,
      configurable: true,
      get: function () {
        if (!stackCaptured) {
          // Capture stack trace on first access
          Error.captureStackTrace(this, ServerError)
          stackValue = this.stack
          stackCaptured = true
          // Replace getter with direct value for performance
          Object.defineProperty(this, 'stack', {
            value: stackValue,
            writable: true,
            configurable: true,
            enumerable: false
          })
        }
        return stackValue
      },
      set: function (value) {
        stackValue = value
        stackCaptured = true
      }
    })

    // redefine the error message
    Object.defineProperty(err, 'message', {
      enumerable: true,
      configurable: true,
      value: msg,
      writable: true
    })

    // redefine the error name
    Object.defineProperty(err, 'name', {
      enumerable: false,
      configurable: true,
      value: className,
      writable: true
    })

    return err
  }

  inherits(ServerError, HttpError)
  nameFunc(ServerError, className)

  ServerError.prototype.status = code
  ServerError.prototype.statusCode = code
  ServerError.prototype.expose = false

  return ServerError
}

/**
 * Set the name of a function, if possible.
 * @private
 */

function nameFunc (func, name) {
  var desc = Object.getOwnPropertyDescriptor(func, 'name')

  if (desc && desc.configurable) {
    desc.value = name
    Object.defineProperty(func, 'name', desc)
  }
}

/**
 * Populate the exports object with constructors for every error class.
 * @private
 */

function populateConstructorExports (exports, codes, HttpError) {
  codes.forEach(function forEachCode (code) {
    var CodeError
    var name = toIdentifier(statuses.message[code])

    switch (codeClass(code)) {
      case 400:
        CodeError = createClientErrorConstructor(HttpError, name, code)
        break
      case 500:
        CodeError = createServerErrorConstructor(HttpError, name, code)
        break
    }

    if (CodeError) {
      // export the constructor
      exports[code] = CodeError
      exports[name] = CodeError
    }
  })
}

/**
 * Get a class name from a name identifier.
 *
 * @param {string} name
 * @returns {string}
 * @private
 */

function toClassName (name) {
  return name.slice(-5) === 'Error' ? name : name + 'Error'
}
