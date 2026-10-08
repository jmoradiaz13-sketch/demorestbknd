const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ['efectivo', 'tarjeta', 'transferencia', 'mixto'], default: 'efectivo' },
  milestone: { type: mongoose.Schema.Types.ObjectId, default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, default: Date.now }
}, { _id: true });

// Hitos de pago manuales (ej. anticipo acordado, saldo): sin plantilla,
// el restaurante define etiqueta, monto y vencimiento por evento.
const milestoneSchema = new mongoose.Schema({
  etiqueta: { type: String, required: [true, 'La etiqueta del hito es requerida'], trim: true },
  monto: { type: Number, required: true, min: 0.01 },
  vencimiento: { type: Date, default: null },
  estado: { type: String, enum: ['pendiente', 'parcial', 'pagado'], default: 'pendiente' }
}, { _id: true, timestamps: true });

const eventSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  customerPhone: { type: String, default: '' },
  customerEmail: { type: String, default: '' },
  eventType: { type: String, enum: ['evento_local', 'catering_externo'], default: 'evento_local' },
  eventDate: { type: Date, required: true },
  endDate: { type: Date, default: null },
  setupTime: { type: Date, default: null },
  theme: { type: String, default: '' },
  numberOfAttendees: { type: Number, default: 0 },
  kitchenMenu: { type: String, default: '' },
  barMenu: { type: String, default: '' },
  otherMenu: { type: String, default: '' },
  staffAssigned: { type: String, default: '' },
  rentals: { type: String, default: '' },
  allergies: { type: String, default: '' },
  serviceNotes: { type: String, default: '' },
  status: { type: String, enum: ['pendiente', 'confirmado', 'realizado', 'cancelado'], default: 'pendiente' },
  totalCost: { type: Number, required: true, min: 0 },
  payments: [paymentSchema],
  milestones: [milestoneSchema],
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
