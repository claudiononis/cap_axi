# AxI OData Contract Draft

## Objetivo
Definir el contrato OData minimo para migrar la app AxI desde `JSONModel` mock a persistencia real, sin rehacer la estructura UI5 ya implementada.

El alcance cubre:
- parametrizacion de metodos
- asignaciones a sociedades
- series de indices
- periodos de indices
- reglas contables AxI
- corridas del cockpit
- items de simulacion / contabilizacion
- acciones de negocio del cockpit

## Criterios de diseno
- Mantener el modelo funcional actual del frontend.
- Separar entidades de parametrizacion de entidades transaccionales.
- Exponer `CRUD` para parametrizacion.
- Exponer `actions` para operaciones de negocio del cockpit.
- Conservar vigencias como parte explicita del modelo.
- Permitir convivencia temporal entre mock y OData por modulo.

## Entidades

### Methods
Cabecera del metodo de inflacion.

| Campo | Tipo sugerido | Key | Notas |
| --- | --- | --- | --- |
| `MethodId` | `String(40)` | Si | Identificador tecnico |
| `Description` | `String(255)` | No | Texto funcional |
| `Country` | `String(3)` | No | ISO pais o codigo interno |
| `Ledger` | `String(10)` | No | Ledger de aplicacion |
| `IndexSeries` | `String(40)` | No | Referencia a `IndexSeries.Code` |
| `DocumentType` | `String(10)` | No | Tipo de documento contable |
| `MonthlyReversal` | `Boolean` | No | Reversa mensual |
| `YearEndNoReversal` | `Boolean` | No | Cierre anual sin reversa |
| `Active` | `Boolean` | No | Estado logico |
| `ValidFrom` | `Date` | No | Inicio vigencia |
| `ValidTo` | `Date` | No | Fin vigencia |

Navegacion:
- `Assignments` -> `MethodAssignments`

### MethodAssignments
Asignacion de metodo a sociedad.

| Campo | Tipo sugerido | Key | Notas |
| --- | --- | --- | --- |
| `MethodId` | `String(40)` | Si | FK a `Methods` |
| `CompanyCode` | `String(10)` | Si | Sociedad |
| `ValidFrom` | `Date` | Si | Parte de la key por vigencia |
| `Active` | `Boolean` | No | Estado logico |
| `ValidTo` | `Date` | No | Fin vigencia |

Regla de negocio:
- no permitir solapamiento para misma `CompanyCode + Ledger + fecha`

### IndexSeries
Cabecera de serie de indice.

| Campo | Tipo sugerido | Key | Notas |
| --- | --- | --- | --- |
| `Code` | `String(40)` | Si | Codigo de serie |
| `Name` | `String(255)` | No | Descripcion |
| `Country` | `String(3)` | No | Pais aplicable |
| `Periodicity` | `String(20)` | No | En demo actual: `MONTHLY` |
| `Active` | `Boolean` | No | Estado logico |

Navegacion:
- `Periods` -> `IndexPeriods`

### IndexPeriods
Valores mensuales de una serie.

| Campo | Tipo sugerido | Key | Notas |
| --- | --- | --- | --- |
| `SeriesCode` | `String(40)` | Si | FK a `IndexSeries` |
| `Period` | `String(7)` | Si | Formato `YYYY-MM` |
| `Value` | `Decimal(15,3)` | No | Valor del indice |
| `Active` | `Boolean` | No | Estado del periodo |

Reglas de negocio:
- no permitir periodos duplicados
- no permitir huecos mensuales en una serie activa

### AccountRules
Determinacion contable AxI para una sociedad y ledger.

| Campo | Tipo sugerido | Key | Notas |
| --- | --- | --- | --- |
| `RuleId` | `String(60)` | Si | Identificador tecnico |
| `GLAccount` | `String(20)` | No | Cuenta base |
| `Description` | `String(255)` | No | Descripcion |
| `CompanyCode` | `String(10)` | No | Sociedad |
| `Ledger` | `String(10)` | No | Ledger |
| `Classification` | `String(20)` | No | `MONETARY` / `NON_MONETARY` |
| `Category` | `String(10)` | No | `BS` / `PL` |
| `AdjustmentAccount` | `String(20)` | No | Cuenta AxI |
| `OffsetAccount` | `String(20)` | No | Cuenta puente |
| `RecpamAccount` | `String(20)` | No | Cuenta RECPAM |
| `DocumentType` | `String(10)` | No | Tipo de documento |
| `SimulationFactor` | `Decimal(9,4)` | No | Solo para mock/demo |
| `Active` | `Boolean` | No | Estado logico |
| `ValidFrom` | `Date` | No | Inicio vigencia |
| `ValidTo` | `Date` | No | Fin vigencia |

Reglas de negocio:
- no permitir solapamiento para misma `CompanyCode + Ledger + GLAccount`
- si `Classification = NON_MONETARY`, `AdjustmentAccount` y `OffsetAccount` son obligatorias

### Runs
Cabecera de corrida del cockpit.

| Campo | Tipo sugerido | Key | Notas |
| --- | --- | --- | --- |
| `RunId` | `String(80)` | Si | RUN_ID tecnico |
| `CompanyCode` | `String(10)` | No | Sociedad |
| `CompanyName` | `String(255)` | No | Denormalizado para auditoria |
| `Ledger` | `String(10)` | No | Ledger derivado |
| `FiscalYear` | `String(4)` | No | Ejercicio |
| `FiscalPeriod` | `String(2)` | No | Periodo |
| `RunType` | `String(20)` | No | `MONTHLY` / `YEAR_END` |
| `ExecutionMode` | `String(20)` | No | `TEST` / `UPDATE` |
| `MethodId` | `String(40)` | No | Metodo derivado |
| `IndexSeries` | `String(40)` | No | Serie derivada |
| `DocumentType` | `String(10)` | No | Tipo documento |
| `PostingDate` | `Date` | No | Fecha de contabilizacion |
| `ExecutedAt` | `Timestamp` | No | Fecha/hora de ejecucion |
| `Status` | `String(20)` | No | `DRAFT`, `SIMULATED`, `POSTED`, `FAILED`, `REVERSED` |
| `TriggeredBy` | `String(80)` | No | Usuario |
| `RequestPayload` | `LargeString` | No | Auditoria |
| `ResponsePayload` | `LargeString` | No | Auditoria |

Navegacion:
- `Items` -> `RunItems`

### RunItems
Detalle de simulacion o contabilizacion.

| Campo | Tipo sugerido | Key | Notas |
| --- | --- | --- | --- |
| `RunId` | `String(80)` | Si | FK a `Runs` |
| `LineNo` | `Integer` | Si | Secuencia |
| `GLAccount` | `String(20)` | No | Cuenta base |
| `Description` | `String(255)` | No | Descripcion |
| `BaseBalance` | `Decimal(15,2)` | No | Saldo base |
| `AdjustmentPercent` | `Decimal(9,4)` | No | Porcentaje AxI |
| `AdjustmentAmount` | `Decimal(15,2)` | No | Importe ajuste |
| `AdjustmentAccount` | `String(20)` | No | Cuenta AxI |
| `OffsetAccount` | `String(20)` | No | Cuenta puente |
| `RecpamAccount` | `String(20)` | No | Cuenta RECPAM |

## Relaciones
- `Methods(1) -> (n) MethodAssignments`
- `IndexSeries(1) -> (n) IndexPeriods`
- `Runs(1) -> (n) RunItems`

## Actions

### `DeriveMethod`
Resuelve el metodo valido para sociedad y fecha.

Input:
```json
{
  "CompanyCode": "CL10",
  "RunDate": "2026-03-16"
}
```

Output:
```json
{
  "MethodId": "INF_CLP_01",
  "Description": "Metodo de inflacion para Chile ledger local",
  "Ledger": "2L",
  "IndexSeries": "IPC_CL",
  "DocumentType": "YC"
}
```

Validaciones:
- sociedad obligatoria
- fecha obligatoria
- debe existir un metodo activo con asignacion activa para esa fecha

### `SimulateRun`
Genera corrida y detalle simulado sin contabilizar.

Input:
```json
{
  "CompanyCode": "CL10",
  "RunDate": "2026-03-16",
  "PostingDate": "2026-03-31",
  "FiscalYear": "2026",
  "FiscalPeriod": "03",
  "RunType": "MONTHLY",
  "ExecutionMode": "TEST",
  "TriggeredBy": "user.axi"
}
```

Output:
```json
{
  "RunId": "RUN-CL10-202603-000001",
  "Status": "SIMULATED",
  "MethodId": "INF_CLP_01",
  "IndexSeries": "IPC_CL",
  "Items": [
    {
      "LineNo": 1,
      "GLAccount": "150100",
      "Description": "Inventarios CL10",
      "BaseBalance": 148726.00,
      "AdjustmentPercent": 11.98,
      "AdjustmentAmount": 17817.37,
      "AdjustmentAccount": "AXI_INV_CL",
      "OffsetAccount": "AXI_BRIDGE_CL",
      "RecpamAccount": "AXI_RECPAM_CL"
    }
  ]
}
```

Validaciones:
- parametros obligatorios
- derivacion de metodo exitosa
- existencia de serie de indice y periodo
- existencia de reglas contables vigentes

### `PostRun`
Contabiliza una corrida simulada.

Input:
```json
{
  "RunId": "RUN-CL10-202603-000001"
}
```

Output:
```json
{
  "RunId": "RUN-CL10-202603-000001",
  "Status": "POSTED",
  "JournalEntry": "JE-CL10-202603"
}
```

Validaciones:
- la corrida debe existir
- la corrida debe estar `SIMULATED`
- no debe existir otra corrida `POSTED` para misma `CompanyCode + Ledger + FiscalYear + FiscalPeriod`

### `ReverseRun`
Revierte una corrida contabilizada.

Input:
```json
{
  "RunId": "RUN-CL10-202603-000001"
}
```

Output:
```json
{
  "RunId": "RUN-CL10-202603-000001",
  "Status": "REVERSED",
  "ReversalJournalEntry": "RV-CL10-202603"
}
```

Validaciones:
- la corrida debe existir
- la corrida debe estar `POSTED`

## Reglas backend que no deben quedar solo en frontend
- obligatorios de `Methods`
- `ValidFrom <= ValidTo`
- no solapamiento de `MethodAssignments`
- no solapamiento de `AccountRules`
- no duplicados ni huecos en `IndexPeriods`
- serie de indice activa y consistente con pais
- derivacion de metodo por sociedad y fecha
- unicidad de corrida `POSTED` por `CompanyCode + Ledger + FiscalYear + FiscalPeriod`

## Mapping desde mocks actuales

### `webapp/model/mock/methods.json`
- `methods[]` -> `Methods`
- `methods[].assignments[]` -> `MethodAssignments`

### `webapp/model/mock/indexes.json`
- `series[]` -> `IndexSeries`
- `series[].values[]` -> `IndexPeriods`

### `webapp/model/mock/accounts.json`
- `rules[]` -> `AccountRules`

### `webapp/model/mock/runs.json`
- `runs[]` -> `Runs`
- `simulationEntries` del cockpit -> `RunItems`

## Orden de migracion recomendado
1. `Methods` y `MethodAssignments`
2. `IndexSeries` y `IndexPeriods`
3. `AccountRules`
4. `Runs` y `RunItems`
5. actions `DeriveMethod`, `SimulateRun`, `PostRun`, `ReverseRun`

## Estrategia UI5
- Mantener las vistas XML actuales.
- Migrar primero modelos de parametrizacion.
- Reemplazar `JSONModel` por `ODataModel` por modulo, no toda la app de una.
- Mantener `Cockpit` en mock hasta que existan entidades maestras y actions.
- Mover validaciones criticas al backend y dejar en frontend solo prevalidacion UX.

## Siguiente paso tecnico
Con este contrato ya se puede pasar a una implementacion backend en cualquiera de estos formatos:
- CDS/CAP
- SAP Gateway SEGW
- RAP

El siguiente entregable recomendado es uno de estos dos:
1. un draft de modelo CDS con entidades y actions
2. un plan de adaptacion UI5 modulo por modulo desde `JSONModel` a `ODataModel`
