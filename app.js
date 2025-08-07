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

// consulta preparada para a busca por descrição usando FTS5.
// A query usa o operador MATCH e ordena por relevância (rank).
const searchNcmStmt = db.prepare(`
  SELECT DISTINCT ncm, descricao 
  FROM ibpt_search 
  WHERE descricao MATCH ? 
  ORDER BY rank 
  LIMIT 15
`);

const getByCestStmt = db.prepare('SELECT * FROM cest_data WHERE cest = ?');

app.use((req, res, next) => {
  // Log de requisições (opcional)
  // console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Novo endpoint para buscar NCMs por descrição de produto.
app.get('/search/:descricao', (req, res) => {
  try {
    const { descricao } = req.params;
    if (!descricao || descricao.length < 3) {
      return res.status(400).json({ error: 'A descrição da busca deve ter pelo menos 3 caracteres.' });
    }
    
    // O FTS5 espera que os termos sejam separados por operadores lógicos.
    // Formatamos a string para que cada palavra seja um termo de busca obrigatório (AND).
    const termoBusca = descricao.trim().split(/\s+/).join(' AND ');

    const resultados = searchNcmStmt.all(termoBusca);

    if (resultados && resultados.length > 0) {
      res.json(resultados);
    } else {
      res.status(404).json({ error: 'Nenhum NCM encontrado para a descrição fornecida.' });
    }
  } catch (error) {
    console.error('Erro na busca /search:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});


// --- ENDPOINTS ORIGINAIS (FUNCIONANDO COMO ANTES) ---

// Endpoint principal que retorna o objeto formatado
app.get('/:uf/:ncm', (req, res) => {
  try {
    const { uf, ncm } = req.params;
    const ufUpper = uf.toUpperCase();
    const ncmCompleto = ncm.replace(/\./g, '');
    
    const ibptData = getIbptStmt.get(ufUpper, ncmCompleto);

    if (!ibptData) {
      return res.status(404).json({ error: 'NCM não encontrado para a UF especificada.' });
    }

    const totalTributosNacionais = Math.round(((ibptData.aliqNacional || 0) + (ibptData.aliqEstadual || 0) + (ibptData.aliqMunicipal || 0)) * 100) / 100;
    const totalTributosImportados = Math.round(((ibptData.aliqImportado || 0) + (ibptData.aliqEstadual || 0) + (ibptData.aliqMunicipal || 0)) * 100) / 100;

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
    
    const cestData = getCestStmt.all(ncmCompleto, ncmCompleto);
    response.CESTs = cestData;
    res.json(response);

  } catch (error) {
    console.error('Erro na consulta /:uf/:ncm:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Endpoint para consultar APENAS dados brutos do IBPT
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

// Endpoint para consultar APENAS dados brutos do CEST
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

// Endpoint para buscar NCMs a partir de um código CEST.
app.get('/cest/search/:cest', (req, res) => {
  try {
    const cest = req.params.cest.replace(/\./g, '');
    const data = getByCestStmt.all(cest);
    if (data && data.length > 0) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'Nenhum resultado encontrado para o CEST especificado.' });
    }
  } catch (error) {
    console.error('Erro na consulta /cest/search:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});


app.listen(PORT, () => {
  console.log(`Servidor OpenFiscal rodando na porta ${PORT}`);
});
