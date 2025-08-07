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
  //console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// << MUDANÇA >>: Endpoint principal agora é /:uf/:ncm e monta a resposta no formato desejado
app.get('/:uf/:ncm', (req, res) => {
  try {
    const { uf, ncm } = req.params;
    const ufUpper = uf.toUpperCase();
    const ncmCompleto = ncm.replace(/\./g, '');
    
    // 1. Busca os dados do IBPT
    const ibptData = getIbptStmt.get(ufUpper, ncmCompleto);

    if (!ibptData) {
      return res.status(404).json({ error: 'NCM não encontrado para a UF especificada.' });
    }

    // 2. Calcula os totais de tributos
    const totalTributosNacionais = Math.round(((ibptData.aliqNacional || 0) + (ibptData.aliqEstadual || 0) + (ibptData.aliqMunicipal || 0)) * 100) / 100;
    const totalTributosImportados = Math.round(((ibptData.aliqImportado || 0) + (ibptData.aliqEstadual || 0) + (ibptData.aliqMunicipal || 0)) * 100) / 100;

    // 3. Monta o objeto de resposta principal no formato do projeto antigo
    const response = {
      Codigo: ibptData.ncm,
      UF: ibptData.uf,
      EX: ibptData.ex,
      Descricao: ibptData.descricao,
      Nacional: ibptData.aliqNacional,
      Estadual: ibptData.aliqEstadual,
      Importado: ibptData.aliqImportado,
      Municipal: ibptData.aliqMunicipal,
      TotalTributosNacionais: totalTributosNacionais,
      TotalTributosImportados: totalTributosImportados,
      Tipo: ibptData.tipo,
      VigenciaInicio: ibptData.vigenciaInicio,
      VigenciaFim: ibptData.vigenciaFim,
      Chave: ibptData.chave,
      Versao: ibptData.versao,
      Fonte: ibptData.fonte
    };
    
    // 4. Busca os dados do CEST
    const cestData = getCestStmt.all(ncmCompleto, ncmCompleto);
    
    // 5. Adiciona os dados do CEST ao objeto de resposta
    response.CESTs = cestData;

    res.json(response);

  } catch (error) {
    console.error('Erro na consulta /:uf/:ncm:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});


// Os endpoints antigos podem ser mantidos para consultas específicas, se desejar.
// Eles continuarão funcionando como antes.

app.get('/ibpt/:uf/:ncm', (req, res) => {
  try {
    const { uf, ncm } = req.params;
    const data = getIbptStmt.get(uf.toUpperCase(), ncm.replace(/\./g, ''));
    if (data) res.json(data);
    else res.status(404).json({ error: 'Nenhum dado do IBPT encontrado para a UF e NCM especificados.' });
  } catch (error) {
    console.error('Erro na consulta /ibpt:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/cest/:ncm', (req, res) => {
  try {
    const ncm = req.params.ncm.replace(/\./g, '');
    const data = getCestStmt.all(ncm, ncm);
    if (data && data.length > 0) res.json(data);
    else res.status(404).json({ error: 'Nenhum CEST encontrado para o NCM especificado.' });
  } catch (error) {
    console.error('Erro na consulta /cest:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});


app.listen(PORT, () => {
  console.log(`Servidor OpenFiscal rodando na porta ${PORT}`);
});
