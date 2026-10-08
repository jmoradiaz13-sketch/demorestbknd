const CashClosing = require('../models/CashClosing');
const Sale = require('../models/Sale');
const Event = require('../models/Event');

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'mixto'];

// Calcula el corte del turno: ventas pagadas + abonos de eventos en la ventana
// [openedAt, hasta], desglosados por método, más caja menor (movimientos).
// Efectivo Esperado = Base + Efectivo (ventas y eventos) + Entradas − Salidas.
// Tarjeta/transferencia/mixto NO tocan la gaveta: van solo al desglose.
async function calcularCorte(cashClosing, hasta) {
  const desde = cashClosing.openedAt;

  const sales = await Sale.find({
    createdAt: { $gte: desde, $lte: hasta },
    status: 'pagada'
  }).select('total paymentMethod').lean();

  const porMetodo = { efectivo: 0, tarjeta: 0, transferencia: 0, mixto: 0 };
  let ventasBrutas = 0;
  sales.forEach((s) => {
    const m = METODOS.includes(s.paymentMethod) ? s.paymentMethod : 'efectivo';
    porMetodo[m] += s.total || 0;
    ventasBrutas += s.total || 0;
  });

  const eventsWithPayments = await Event.find({
    'payments.date': { $gte: desde, $lte: hasta }
  }).select('payments').lean();

  const eventosPorMetodo = { efectivo: 0, tarjeta: 0, transferencia: 0, mixto: 0 };
  let abonosEventos = 0;
  let conteoAbonos = 0;
  eventsWithPayments.forEach((ev) => {
    (ev.payments || []).forEach((p) => {
      if (p.date >= desde && p.date <= hasta) {
        const m = METODOS.includes(p.method) ? p.method : 'efectivo';
        eventosPorMetodo[m] += p.amount || 0;
        abonosEventos += p.amount || 0;
        conteoAbonos += 1;
      }
    });
  });

  let entradas = 0;
  let salidas = 0;
  let entradasEfectivo = 0;
  let salidasEfectivo = 0;
  (cashClosing.movements || []).forEach((m) => {
    // Movimientos viejos sin método cuentan como efectivo (compatibilidad).
    const esEfectivo = !m.method || m.method === 'efectivo';
    if (m.tipo === 'entrada') {
      entradas += m.amount || 0;
      if (esEfectivo) entradasEfectivo += m.amount || 0;
    } else if (m.tipo === 'salida') {
      salidas += m.amount || 0;
      if (esEfectivo) salidasEfectivo += m.amount || 0;
    }
  });

  // Solo el efectivo toca la gaveta: tarjeta/transferencia van al desglose.
  const efectivoEsperado = (cashClosing.initialAmount || 0)
    + porMetodo.efectivo + eventosPorMetodo.efectivo
    + entradasEfectivo - salidasEfectivo;

  return {
    sales, porMetodo, ventasBrutas,
    eventosPorMetodo, abonosEventos, conteoAbonos,
    entradas, salidas, entradasEfectivo, salidasEfectivo, efectivoEsperado
  };
}

// Arma la foto inmutable del Reporte Z (solo lectura contable).
// Impuestos y propinas: el modelo de venta no los discrimina hoy, así que se
// reportan en 0 con nota explícita en vez de inventar cifras.
function construirReporteZ(cashClosing, corte, cajeroNombre, hasta) {
  const espTarjeta = corte.porMetodo.tarjeta + corte.eventosPorMetodo.tarjeta;
  const espTransf = corte.porMetodo.transferencia + corte.eventosPorMetodo.transferencia;
  return {
    version: 1,
    titulo: 'Reporte Z - Cierre de Caja',
    cajaId: String(cashClosing._id),
    apertura: cashClosing.openedAt,
    cierre: hasta,
    cajero: cajeroNombre,
    baseInicial: cashClosing.initialAmount || 0,
    ventasBrutas: corte.ventasBrutas,
    ventasPorMetodo: { ...corte.porMetodo },
    abonosEventos: corte.abonosEventos,
    eventosPorMetodo: { ...corte.eventosPorMetodo },
    impuestos: {
      base: 0, impoconsumo: 0, iva: 0,
      nota: 'Las ventas no discriminan impuestos; precios con impuesto incluido sin discriminar.'
    },
    propinas: { total: 0, nota: 'Propinas no registradas por separado en el periodo.' },
    movimientos: (cashClosing.movements || []).map((m) => ({
      tipo: m.tipo, amount: m.amount, concept: m.concept,
      method: m.method || 'efectivo', date: m.date
    })),
    entradasTotal: corte.entradas,
    salidasTotal: corte.salidas,
    efectivoEsperado: corte.efectivoEsperado,
    efectivoReal: cashClosing.actualCash,
    diferencia: cashClosing.difference,
    conteoPorMetodo: {
      tarjetaEsperado: espTarjeta,
      tarjetaContado: cashClosing.actualTarjeta,
      tarjetaDiferencia: cashClosing.actualTarjeta === null || cashClosing.actualTarjeta === undefined
        ? null : cashClosing.actualTarjeta - espTarjeta,
      transferenciaEsperado: espTransf,
      transferenciaContado: cashClosing.actualTransferencia,
      transferenciaDiferencia: cashClosing.actualTransferencia === null || cashClosing.actualTransferencia === undefined
        ? null : cashClosing.actualTransferencia - espTransf
    },
    notas: cashClosing.notes || '',
    transacciones: corte.sales.length + corte.conteoAbonos
  };
}

exports.open = async (req, res, next) => {
  try {
    // Verificar si ya hay una caja abierta
    const openCash = await CashClosing.findOne({ status: 'abierta' });
    if (openCash) {
      return res.status(400).json({ message: 'Ya existe una caja abierta. Ciérrela primero.' });
    }

    const cashClosing = await CashClosing.create({
      user: req.user._id,
      initialAmount: req.body.initialAmount || 0
    });
    res.status(201).json(cashClosing);
  } catch (error) {
    next(error);
  }
};

exports.close = async (req, res, next) => {
  try {
    const cashClosing = await CashClosing.findById(req.params.id);
    if (!cashClosing) return res.status(404).json({ message: 'Arqueo no encontrado' });
    if (cashClosing.status === 'cerrada') {
      return res.status(400).json({ message: 'Esta caja ya fue cerrada' });
    }

    const pendingSales = await Sale.countDocuments({
      createdAt: { $gte: cashClosing.openedAt, $lte: new Date() },
      status: 'pendiente'
    });

    if (pendingSales > 0) {
      return res.status(400).json({ message: `No se puede cerrar la caja. Hay ${pendingSales} cuentas (mesas) pendientes de pago.` });
    }

    const ahora = new Date();
    const corte = await calcularCorte(cashClosing, ahora);

    cashClosing.closedAt = ahora;
    cashClosing.totalSales = corte.ventasBrutas + corte.abonosEventos; // Cuadre total del turno
    cashClosing.totalTransactions = corte.sales.length + corte.conteoAbonos;
    cashClosing.salesEfectivo = corte.porMetodo.efectivo;
    cashClosing.salesTarjeta = corte.porMetodo.tarjeta;
    cashClosing.salesTransferencia = corte.porMetodo.transferencia;
    cashClosing.salesMixto = corte.porMetodo.mixto;
    cashClosing.eventEfectivo = corte.eventosPorMetodo.efectivo;
    cashClosing.eventTarjeta = corte.eventosPorMetodo.tarjeta;
    cashClosing.eventTransferencia = corte.eventosPorMetodo.transferencia;
    cashClosing.eventMixto = corte.eventosPorMetodo.mixto;
    cashClosing.entradas = corte.entradas;
    cashClosing.salidas = corte.salidas;
    // expectedCash = efectivo en gaveta (fórmula por método, no venta total)
    cashClosing.expectedCash = corte.efectivoEsperado;
    cashClosing.actualCash = req.body.actualCash || 0;
    const numONulo = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
    cashClosing.actualTarjeta = numONulo(req.body.actualTarjeta);
    cashClosing.actualTransferencia = numONulo(req.body.actualTransferencia);
    cashClosing.difference = cashClosing.actualCash - corte.efectivoEsperado;
    cashClosing.notes = req.body.notes || '';
    cashClosing.status = 'cerrada';

    await cashClosing.populate('user', 'name');
    cashClosing.reporteZ = construirReporteZ(
      cashClosing, corte, cashClosing.user?.name || '', ahora
    );

    await cashClosing.save();
    res.json(cashClosing);
  } catch (error) {
    next(error);
  }
};

// Registra una entrada o salida menor atada al turno abierto.
exports.addMovement = async (req, res, next) => {
  try {
    const cashClosing = await CashClosing.findById(req.params.id);
    if (!cashClosing) return res.status(404).json({ message: 'Arqueo no encontrado' });
    if (cashClosing.status === 'cerrada') {
      return res.status(400).json({ message: 'La caja ya fue cerrada, no admite movimientos' });
    }

    const { tipo, amount, concept, method } = req.body;
    if (!['entrada', 'salida'].includes(tipo)) {
      return res.status(400).json({ message: 'Tipo inválido: use entrada o salida' });
    }
    const metodo = method || 'efectivo';
    if (!['efectivo', 'tarjeta', 'transferencia'].includes(metodo)) {
      return res.status(400).json({ message: 'Método inválido: use efectivo, tarjeta o transferencia' });
    }
    const monto = Number(amount);
    if (!(monto > 0)) {
      return res.status(400).json({ message: 'El monto debe ser mayor a 0' });
    }
    if (!concept || !String(concept).trim()) {
      return res.status(400).json({ message: 'El concepto es obligatorio' });
    }

    cashClosing.movements.push({
      tipo, amount: monto, concept: String(concept).trim(), method: metodo, user: req.user._id
    });
    await cashClosing.save();
    res.status(201).json(cashClosing);
  } catch (error) {
    next(error);
  }
};

exports.getAll = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const closings = await CashClosing.find()
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await CashClosing.countDocuments();
    res.json({ closings, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
};

exports.getCurrent = async (req, res, next) => {
  try {
    const current = await CashClosing.findOne({ status: 'abierta' }).populate('user', 'name');
    if (!current) return res.json({ open: false, message: 'No hay caja abierta' });

    // Corte en vivo: mismo cálculo del cierre para previsualizar el desglose
    const corte = await calcularCorte(current, new Date());

    res.json({
      open: true,
      cashClosing: current,
      currentTotalSales: corte.ventasBrutas,
      currentTransactions: corte.sales.length,
      desglose: {
        ventasPorMetodo: corte.porMetodo,
        eventosPorMetodo: corte.eventosPorMetodo,
        abonosEventos: corte.abonosEventos,
        entradas: corte.entradas,
        salidas: corte.salidas,
        movimientos: current.movements || [],
        efectivoEsperado: corte.efectivoEsperado
      }
    });
  } catch (error) {
    next(error);
  }
};
