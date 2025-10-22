sap.ui.define([
       "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel"


], (Controller, MessageToast, MessageBox, JSONModel) => {
    "use strict";

    return Controller.extend("simulate.simulatefiori.controller.View1", {
    
onSimulate: async function () {

      const oView = this.getView();
      const oModel = oView.getModel();

      // === 1️⃣ Leer parámetros de pantalla ===
      const sTenant = oView.byId("tenantId").getValue();

      // ✅ Corregido: obtener fecha ISO
      const oDate = oView.byId("postingDate").getDateValue();
      let sDateISO = null;
      if (oDate instanceof Date && !isNaN(oDate)) {
        sDateISO = oDate.toISOString().split("T")[0];
      } else {
        sDateISO = oView.byId("postingDate").getValue();
      }

      const fCoef = parseFloat(oView.byId("coef").getValue());
      const sGL = oView.byId("gl").getValue();
      const fAmount = parseFloat(oView.byId("amount").getValue());
      const sSegment = oView.byId("segment").getValue();
      const sCostCenter = oView.byId("costCenter").getValue();
      const sProfitCenter = oView.byId("profitCenter").getValue();

      if (!sTenant || !fCoef || !fAmount) {
        MessageBox.error("Debe completar Tenant, Coeficiente e Importe.");
        return;
      }

      // === 2️⃣ Crear payload con estructura CAP ===
      const oPayload = {
        tenantId: sTenant,
        postingDate: sDateISO, // ✅ Fecha ya en formato correcto
        coef: fCoef,
        items: [
          {
            gl: sGL,
            amount: fAmount,
            segment: sSegment,
            costCenter: sCostCenter,
            profitCenter: sProfitCenter
          }
        ]
      };

      console.log("📤 Enviando payload simulate:", oPayload);

      try {
        // === 3️⃣ Ejecutar acción OData ===
        const oBinding = oModel.bindContext("/simulate(...)");
        oBinding.setParameter("tenantId", sTenant);
        oBinding.setParameter("postingDate", sDateISO);
        oBinding.setParameter("coef", fCoef);
        oBinding.setParameter("items", oPayload.items);

        await oBinding.execute();
        const oResult = oBinding.getBoundContext().getObject();

        console.log("✅ Resultado:", oResult);

        let sText = `Simulación completada para ${sTenant}\n\n`;
        sText += `Fecha: ${sDateISO}\n`;
        sText += `Importe original: ${fAmount.toLocaleString()}\n`;
        sText += `Coeficiente: ${fCoef}\n`;
        sText += `Monto ajustado: ${oResult?.journalPreview ?? "(sin valor)"}`;

        oView.byId("result").setText(sText);
        MessageToast.show("Simulación completada correctamente");
      } catch (error) {
        console.error("❌ Error al llamar al OData:", error);
        MessageBox.error("Error ejecutando simulación: " + error.message);
      }
    }

  });
});