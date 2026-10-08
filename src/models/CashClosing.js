const mongoose = require('mongoose');

// Movimiento menor de caja atado al turno (caja menor): entradas suman al
// efectivo esperado, salidas restan. Quedan en el Reporte Z.
const movementSchema = new mongoose.Schema({
  tipo: { type: String, enum: ['entrada', 'salida'], required: true },
  amount: { type: Number, required: true, min: 0.01 },
  concept: { type: String, required: true, trim: true },
  method: { type: String, enum: ['efectivo', 'tarjeta', 'transferencia'], default: 'efectivo' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now }
}, { _id: true });

const cashClosingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  openedAt: { type: Date, required: true, default: Date.now },
  closedAt: { type: Date, default: null },
  initialAmount: { type: Number, required: true, default: 0, min: 0 },
  totalSales: { type: Number, default: 0, min: 0 },
  totalTransactions: { type: Number, default: 0, min: 0 },
  expectedCash: { type: Number, default: 0 },
  actualCash: { type: Number, default: null },
  actualTarjeta: { type: Number, default: null },
  actualTransferencia: { type: Number, default: null },
  difference: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['abierta', 'cerrada'], default: 'abierta' },
  // — Desglose por medio de pago (ventas pagadas del turno) —
  salesEfectivo: { type: Number, default: 0, min: 0 },
  salesTarjeta: { type: Number, default: 0, min: 0 },
  salesTransferencia: { type: Number, default: 0, min: 0 },
  salesMixto: { type: Number, default: 0, min: 0 },
  // — Abonos de eventos del turno por método —
  eventEfectivo: { type: Number, default: 0, min: 0 },
  eventTarjeta: { type: Number, default: 0, min: 0 },
  eventTransferencia: { type: Number, default: 0, min: 0 },
  eventMixto: { type: Number, default: 0, min: 0 },
  // — Caja menor del turno —
  entradas: { type: Number, default: 0, min: 0 },
  salidas: { type: Number, default: 0, min: 0 },
  movements: [movementSchema],
  // — Foto inmutable del Reporte Z generada al cerrar —
  reporteZ: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });

module.exports = mongoose.model('CashClosing', cashClosingSchema);
