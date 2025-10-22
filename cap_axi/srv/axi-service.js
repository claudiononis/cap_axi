const cds = require("@sap/cds");

module.exports = function () {
  this.on("simulate", async (req) => {
    const { tenantId, postingDate, coef, items } = req.data;

    // Extraer el primer ítem del array
    const item = Array.isArray(items) && items.length > 0 ? items[0] : {};

    const { gl, amount, segment, costCenter, profitCenter } = item;

    console.log("📩 Datos recibidos en simulate:", req.data);

    // Validar campos obligatorios
    if (!tenantId || !coef || !amount) {
      req.error(400, "Faltan parámetros obligatorios: tenantId, amount o coef.");
      return;
    }

    // Cálculo del ajuste
    const adjusted = Number(amount) * Number(coef);

    const result = {
      simulationId: `SIM-${Math.floor(Math.random() * 10000)}`,
      journalPreview: `Monto ajustado: ${adjusted}`
    };

    console.log("✔️ Simulación OK:", result);
    return result;
  });
};
