using { axi as db } from '../db/schema';

service AxiService {
  action hola() returns String;

  action simulate(
    tenantId    : String,
    companyCode : String,
    fiscalYear  : Integer,
    fiscalPeriod: Integer,
    postingDate : Date,
    strategy    : String,
    coef        : Decimal(9,6),
    items       : array of {
      gl         : String;
      amount     : Decimal(15,2);
      segment    : String;
      costCenter : String;
      profitCenter: String;
    }
  ) returns {
    simulationId   : String; 
    journalPreview : LargeString; 
  };

  action post(
     tenantId        : String,
    companyCode     : String,
    fiscalYear      : Integer,
    fiscalPeriod    : Integer,
    postingDate     : Date,      
    docType         : String,
    lines           : LargeString,
    idempotencyKey  : String
  ) returns {
    status          : String;
    documentNumber  : String;
    messages        : LargeString;
    };

  action confirm(
    tenantId       : String,
    simulationId   : String,
    documentNumber : String,
    status         : String
  ) returns { ok : Boolean; }; 
} 

