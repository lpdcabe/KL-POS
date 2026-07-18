import assert from 'node:assert/strict'
import test from 'node:test'
import request from 'supertest'
import { createApp } from '../src/app.js'

test('GET /api/health reports API status', async () => {
  const response = await request(createApp()).get('/api/health').expect(200)

  assert.equal(response.body.status, 'ok')
  assert.equal(response.body.service, 'kl-chicken-wings-pos-api')
  assert.ok(response.body.timestamp)
})

test('unknown API routes return JSON 404', async () => {
  const response = await request(createApp()).get('/api/unknown').expect(404)
  assert.match(response.body.error, /Route not found/)
})

