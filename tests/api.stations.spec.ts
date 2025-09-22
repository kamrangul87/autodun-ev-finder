import { test, expect } from '@playwright/test';

test('GET /api/stations with valid bbox returns array', async ({ request }) => {
  const north = 51.52, south = 51.50, east = -0.09, west = -0.13;
  const params = new URLSearchParams({
    north: String(north), south: String(south), east: String(east), west: String(west)
  });
  const res = await request.get(`/api/stations?${params.toString()}`);
  expect(res.ok()).toBeTruthy();
  const arr = await res.json();
  expect(Array.isArray(arr)).toBeTruthy();
  if (arr.length > 0) {
    expect(typeof arr[0].lat).toBe('number');
    expect(typeof arr[0].lng).toBe('number');
  }
});

test('GET /api/stations with invalid bbox returns 400', async ({ request }) => {
  const params = new URLSearchParams({
    north: '0', south: '0', east: '0', west: '0'
  });
  const res = await request.get(`/api/stations?${params.toString()}`);
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toBe('invalid_bbox');
});
