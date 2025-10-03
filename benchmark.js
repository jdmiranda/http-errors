#!/usr/bin/env node

'use strict'

const createError = require('./')
const Benchmark = require('benchmark')
const suite = new Benchmark.Suite()

// Common status codes for testing
const statusCodes = [400, 401, 403, 404, 500]
const iterations = 50000

// Warmup
console.log('Warming up...')
for (let i = 0; i < 10000; i++) {
  createError(404)
  createError(500, 'Internal Server Error')
}

console.log('\n=== HTTP Error Creation Benchmarks ===\n')

// Benchmark 1: Common error codes without messages (pooling enabled)
suite.add('404 without message (pooled)', function () {
  const err = createError(404)
  // Simulate error release for pooling
  if (createError.releaseError) {
    createError.releaseError(err)
  }
})

suite.add('500 without message (pooled)', function () {
  const err = createError(500)
  if (createError.releaseError) {
    createError.releaseError(err)
  }
})

// Benchmark 2: Errors with custom messages (no pooling)
suite.add('404 with custom message', function () {
  createError(404, 'Resource not found')
})

suite.add('500 with custom message', function () {
  createError(500, 'Internal server error occurred')
})

// Benchmark 3: Different status codes
suite.add('400 Bad Request', function () {
  createError(400)
})

suite.add('401 Unauthorized', function () {
  createError(401)
})

suite.add('403 Forbidden', function () {
  createError(403)
})

// Benchmark 4: Errors with properties (no pooling)
suite.add('404 with properties', function () {
  createError(404, { code: 'RESOURCE_NOT_FOUND', id: 123 })
})

suite.add('500 with properties', function () {
  createError(500, { code: 'INTERNAL_ERROR', details: 'Database connection failed' })
})

// Benchmark 5: Stack trace access
suite.add('404 with stack access', function () {
  const err = createError(404)
  const stack = err.stack // Force stack trace generation
})

suite.add('500 without stack access', function () {
  const err = createError(500)
  // Don't access stack - lazy evaluation
})

// Event listeners
suite.on('cycle', function (event) {
  console.log(String(event.target))
})

suite.on('complete', function () {
  console.log('\n=== Benchmark Complete ===\n')

  // Memory overhead test
  console.log('=== Memory Overhead Analysis ===\n')

  const used1 = process.memoryUsage().heapUsed
  const errors = []

  for (let i = 0; i < 10000; i++) {
    errors.push(createError(404))
  }

  const used2 = process.memoryUsage().heapUsed
  const bytesPerError = (used2 - used1) / 10000

  console.log(`Created 10,000 errors (404)`)
  console.log(`Heap used before: ${(used1 / 1024 / 1024).toFixed(2)} MB`)
  console.log(`Heap used after: ${(used2 / 1024 / 1024).toFixed(2)} MB`)
  console.log(`Memory overhead per error: ${bytesPerError.toFixed(2)} bytes`)

  // Test with pooling
  console.log('\n=== Pooling Performance Test ===\n')

  const poolStart = Date.now()
  for (let i = 0; i < iterations; i++) {
    const err = createError(404)
    if (createError.releaseError) {
      createError.releaseError(err)
    }
  }
  const poolTime = Date.now() - poolStart

  const noPoolStart = Date.now()
  for (let i = 0; i < iterations; i++) {
    createError(404, 'Not Found')
  }
  const noPoolTime = Date.now() - noPoolStart

  console.log(`${iterations} iterations with pooling: ${poolTime}ms (${Math.round(iterations / poolTime * 1000)} ops/sec)`)
  console.log(`${iterations} iterations without pooling: ${noPoolTime}ms (${Math.round(iterations / noPoolTime * 1000)} ops/sec)`)
  console.log(`Performance improvement: ${((noPoolTime - poolTime) / noPoolTime * 100).toFixed(2)}%`)

  // Stack trace lazy evaluation test
  console.log('\n=== Stack Trace Lazy Evaluation Test ===\n')

  const withStackStart = Date.now()
  for (let i = 0; i < iterations; i++) {
    const err = createError(500)
    const stack = err.stack // Access stack
  }
  const withStackTime = Date.now() - withStackStart

  const withoutStackStart = Date.now()
  for (let i = 0; i < iterations; i++) {
    const err = createError(500)
    // Don't access stack
  }
  const withoutStackTime = Date.now() - withoutStackStart

  console.log(`${iterations} iterations with stack access: ${withStackTime}ms (${Math.round(iterations / withStackTime * 1000)} ops/sec)`)
  console.log(`${iterations} iterations without stack access: ${withoutStackTime}ms (${Math.round(iterations / withoutStackTime * 1000)} ops/sec)`)
  console.log(`Lazy stack trace benefit: ${((withStackTime - withoutStackTime) / withStackTime * 100).toFixed(2)}%`)
})

// Run benchmarks
suite.run({ async: true })
