const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  itemType: { type: String, enum: ['Product', 'Dish'], default: 'Product' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  subtotal: { type: Number, required: true, min: 0 },
  esAdicional: { type: Boolean, default: false }
}, { _id: false });

const dishConsumptionSchema = new mongoose.Schema({
  ingredient: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  ingredientName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, default: 'unidades' }
}, { _id: false });

const saleDishItemSchema = new mongoose.Schema({
  dish: { type: mongoose.Schema.Types.ObjectId, ref: 'Dish', required: true },
  dishName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  subtotal: { type: Number, required: true, min: 0 },
  esAdicional: { type: Boolean, default: false },
  ingredientsConsumed: [dishConsumptionSchema]
}, { _id: false });

const saleSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [saleItemSchema],
  dishItems: [saleDishItemSchema],
  total: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pendiente', 'pagada', 'cancelada'], default: 'pagada' },
  paymentMethod: { type: String, enum: ['efectivo', 'tarjeta', 'transferencia', 'mixto'], default: 'efectivo' },
  customerName: { type: String, default: 'Cliente general' },
  notes: { type: String, default: '' },
  // El inventario se descuenta al cobrar (pay), no al registrar.
  // Las ventas pendientes creadas antes de este cambio ya descontaron: ver backfill-stockdeducted.js
  stockDeducted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Sale', saleSchema);
