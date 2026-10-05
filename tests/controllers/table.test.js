const request = require('supertest');
const express = require('express');
const { connectDB, closeDB, clearDB } = require('../helpers');
const tableRoutes = require('../../src/routes/table.routes');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
require('../../src/models/Sale');
require('../../src/models/Reservation');

let app, adminToken;

beforeAll(async () => {
  await connectDB();
  app = express();
  app.use(express.json());
  app.use('/api/tables', tableRoutes);
});
afterAll(async () => { await closeDB(); });
beforeEach(async () => {
  await clearDB();
  const admin = await User.create({ name: 'Admin', email: 'a@test.com', passwordHash: 'Pass123!', role: 'admin' });
  adminToken = require('jsonwebtoken').sign({ id: admin._id }, process.env.JWT_SECRET);
});

describe('Table Controller - salones', () => {
  it('should seed tables distributed in Salon 1, Salon 2 and Para llevar', async () => {
    const res = await request(app).get('/api/tables').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(17);
    const zona = (n) => res.body.find(t => t.number === n).zona;
    expect(zona(0)).toBe('Para llevar');
    expect(zona(1)).toBe('Salón 1');
    expect(zona(8)).toBe('Salón 1');
    expect(zona(9)).toBe('Salón 2');
    expect(zona(16)).toBe('Salón 2');
  });

  it('should backfill zona on tables created before the field existed', async () => {
    // Inserción cruda sin defaults: simula documentos viejos sin campo zona
    await Table.collection.insertMany([{ number: 5, status: 'libre' }, { number: 12, status: 'ocupada' }]);
    const res = await request(app).get('/api/tables').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const zona = (n) => res.body.find(t => t.number === n).zona;
    expect(zona(5)).toBe('Salón 1');
    expect(zona(12)).toBe('Salón 2');
  });

  it('should backfill libre on tables created before status existed', async () => {
    // Inserción cruda sin status: simula documentos viejos que se ven sin texto en el mapa
    await Table.collection.insertOne({ number: 7 });
    const res = await request(app).get('/api/tables').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.find(t => t.number === 7).status).toBe('libre');
    expect(await Table.findOne({ number: 7 }).then(t => t.status)).toBe('libre');
  });
});
