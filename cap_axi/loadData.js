import Database from 'better-sqlite3';

const db = new Database('db/axi.db');
db.prepare(`INSERT OR REPLACE INTO axi_IndexMonth VALUES ('ACME_AR', '2025-09', 1.25);`).run();
db.prepare(`INSERT OR REPLACE INTO axi_AccountMapping VALUES ('ACME_AR', '150000', '150000', '492000');`).run();
console.log('✅ Datos cargados');  
db.close();
