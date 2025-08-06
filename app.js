const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 7389;

const dbPath = path.join(__dirname, 'openfiscal.db');
if (!require('fs').existsSync(dbPath)) {
    console.error(`Erro: Banco de dados 'openfiscal.db' não encontrado.`);
    console.error(`Execute 'node generateDatabase.js' primeiro para criar e popular o banco de dados.`);
    process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
console.log('API conectada ao banco de dados SQLite.');

// Prepara as consultas para reutilização e melhor performance
const getIbptStmt = db.prepare('SELECT * FROM ibpt_taxes WHERE uf = ? AND ncm = ?');

// << CORREÇÃO >>: A consulta agora busca o CEST e sua descrição
//const getCestStmt = db.prepare("SELECT * FROM cest_data WHERE ? LIKE (ncm || '%')");
// << CORREÇÃO >>: A consulta agora busca APENAS o CEST da correspondência mais específica (prefixo mais longo)
const getCestStmt = db.prepare(`
  SELECT *
  FROM cest_data
  WHERE ? LIKE (ncm || '%')
    AND LENGTH(ncm) = (
      SELECT MAX(LENGTH(ncm))
      FROM cest_data
      WHERE ? LIKE (ncm || '%')
    )
`);


app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Endpoint consolidado
app.get('/ncm/:uf/:ncm', (req, res) => {
  try {
    const { uf } = req.params;
    const ncmCompleto = req.params.ncm.replace(/\./g, '');
    
    const ibptData = getIbptStmt.get(uf.toUpperCase(), ncmCompleto);

    if (!ibptData) {
      return res.status(404).json({ error: 'Nenhum dado do IBPT encontrado para a UF e NCM especificados.' });
    }

    //const cestData = getCestStmt.all(ncmCompleto);
    // << CORREÇÃO >>: Passa o NCM duas vezes, pois a nova query tem dois placeholders (?)
    const cestData = getCestStmt.all(ncmCompleto, ncmCompleto);
    
    // << CORREÇÃO >>: Monta o objeto de resposta com o array de objetos para CESTs
    const responseData = {
      ...ibptData,
      cests: cestData // O resultado de .all() já é um array de objetos {cest, descricao}
    };

    res.json(responseData);
  } catch (error) {
    console.error('Erro na consulta consolidada /ncm:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Endpoint para consultar APENAS dados do IBPT
app.get('/ibpt/:uf/:ncm', (req, res) => {
  try {
    const { uf } = req.params;
    const ncm = req.params.ncm.replace(/\./g, '');
    
    const data = getIbptStmt.get(uf.toUpperCase(), ncm);

    if (data) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'Nenhum dado do IBPT encontrado para a UF e NCM especificados.' });
    }
  } catch (error) {
    console.error('Erro na consulta /ibpt:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Endpoint para consultar APENAS dados do CEST
app.get('/cest/:ncm', (req, res) => {
  try {
    const ncm = req.params.ncm.replace(/\./g, '');
    //const data = getCestStmt.all(ncm);
    const data = getCestStmt.all(ncm, ncm);

    if (data && data.length > 0) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'Nenhum CEST encontrado para o NCM especificado.' });
    }
  } catch (error) {
    console.error('Erro na consulta /cest:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor OpenFiscal rodando na porta ${PORT}`);
});
