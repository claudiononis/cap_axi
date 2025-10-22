namespace axi;

/*
  ================================================================
  Definición del modelo de datos para Ajuste por Inflación (AxI)
  ================================================================
  Este modelo se despliega sobre SQLite local, pero es portable
  a HANA u otros backends. Cada entidad representa una tabla.
*/

/*---------------------------------------------------------------
  Tabla de Mapeos de Cuentas
  ---------------------------------------------------------------*/
entity AccountMapping {
  key tenantId     : String(20);   // Cliente lógico
  key gl           : String(10);   // Cuenta contable base
  adjustableGl     : String(10);   // Cuenta ajustable (puede ser igual)
  axiGl            : String(10);   // Cuenta de resultado por inflación
}

/*---------------------------------------------------------------
  Tabla de Índices de Inflación mensuales
  ---------------------------------------------------------------*/
entity IndexMonth {
  key tenantId     : String(20);
  key ym           : String(7);    // Periodo YYYY-MM
  coef             : Decimal(9,6); // Coeficiente de ajuste
}

/*---------------------------------------------------------------
  Tabla de Políticas por Cliente (estrategia, moneda, ledger)
  ---------------------------------------------------------------*/
entity TenantPolicy {
  key tenantId     : String(20);
  strategy         : String(20);   // single-coef, per-month, etc.
  calendar         : String(10);
  ledger           : String(5);
  currency         : String(5);
}

/*---------------------------------------------------------------
  Tabla de Idempotencia (control de reintentos en /post)
  ---------------------------------------------------------------*/
entity Idempotency {
  key tenantId     : String(20);
  key keyId        : String(60);
  result           : LargeString;  // Resultado del posteo (JSON)
  createdAt        : Timestamp;
}

/*---------------------------------------------------------------
  Tabla de Auditoría (bitácora de simulaciones y posteos)
  ---------------------------------------------------------------*/
entity AuditLog {
  key id           : UUID;
  tenantId         : String(20);
  action           : String(20);   // simulate | post | confirm
  payload          : LargeString;  // Request recibido
  result           : LargeString;  // Resultado devuelto
  ts               : String(30);   // Fecha/hora ISO (guardar como texto)
}
