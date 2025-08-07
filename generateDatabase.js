const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');
const csv = require('csvtojson');
const Database = require('better-sqlite3');
const https = require('https');
const { Parser } = require('json2csv');

const db = new Database('openfiscal.db');
db.pragma('journal_mode = WAL');
const metadataFilePath = path.join(__dirname, 'cest_metadata.json');

function criarTabelas() {
  console.log('Verificando e criando tabelas, se necessário...');
  // << MUDANÇA >>: Adicionados novos campos à tabela ibpt_taxes
  db.exec(`
    CREATE TABLE IF NOT EXISTS ibpt_taxes (
      ncm TEXT NOT NULL,
      uf TEXT NOT NULL,
      ex TEXT,
      tipo TEXT,
      descricao TEXT,
      aliqNacional REAL,
      aliqEstadual REAL,
      aliqMunicipal REAL,
      aliqImportado REAL,
      vigenciaInicio TEXT,
      vigenciaFim TEXT,
      chave TEXT,
      versao TEXT,
      fonte TEXT,
      PRIMARY KEY (ncm, uf)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cest_data (
      cest TEXT NOT NULL,
      ncm TEXT NOT NULL,
      descricao TEXT,
      PRIMARY KEY (cest, ncm)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_ncm_ibpt ON ibpt_taxes (ncm);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ncm_cest ON cest_data (ncm);');
  console.log('Tabelas prontas.');
}

async function processarIbpt() {
  console.log('Iniciando processamento dos dados do IBPT...');
  const svnUrl = 'http://svn.code.sf.net/p/acbr/code/trunk2/Exemplos/ACBrTCP/ACBrIBPTax/tabela/';
  
  db.exec('DELETE FROM ibpt_taxes;');
  
  // << MUDANÇA >>: A query de inserção foi atualizada para incluir os novos campos
  const insert = db.prepare(`
    INSERT OR REPLACE INTO ibpt_taxes (ncm, uf, ex, tipo, descricao, aliqNacional, aliqEstadual, aliqMunicipal, aliqImportado, vigenciaInicio, vigenciaFim, chave, versao, fonte)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const inserirMuitos = db.transaction((linhas, uf) => {
    for (const linha of linhas) {
      const ncmLimpo = (linha.codigo || '').replace(/\./g, '');
      // << MUDANÇA >>: insert.run agora passa todos os novos valores
      insert.run(
        ncmLimpo,
        uf,
        linha.ex,
        linha.tipo,
        linha.descricao,
        parseFloat(String(linha.nacionalfederal || '0').replace(',', '.')),
        parseFloat(String(linha.estadual || '0').replace(',', '.')),
        parseFloat(String(linha.municipal || '0').replace(',', '.')),
        parseFloat(String(linha.importadosfederal || '0').replace(',', '.')),
        linha.vigenciainicio,
        linha.vigenciafim,
        linha.chave,
        linha.versao,
        linha.fonte
      );
    }
  });

  try {
    const response = await axios.get(svnUrl);
    const $ = cheerio.load(response.data);
    const csvFiles = [];
    $('a[href$=".csv"]').each((i, link) => {
      csvFiles.push($(link).attr('href'));
    });

    for (const file of csvFiles) {
      const match = /TabelaIBPTax([A-Z]{2})/.exec(file);
      if (!match || !match[1]) {
        console.warn(`Não foi possível extrair a UF do arquivo: ${file}. Pulando.`);
        continue;
      }
      const ufDoArquivo = match[1];
      
      console.log(`Processando IBPT para a UF: ${ufDoArquivo} (arquivo: ${file})...`);
      
      const fileUrl = svnUrl + file;
      const csvStream = (await axios.get(fileUrl, { responseType: 'stream' })).data;
      const jsonArray = await csv({
        delimiter: ';',
        headers: ['codigo', 'ex', 'tipo', 'descricao', 'nacionalfederal', 'importadosfederal', 'estadual', 'municipal', 'vigenciainicio', 'vigenciafim', 'chave', 'versao', 'fonte']
      }).fromStream(csvStream);
      
      inserirMuitos(jsonArray, ufDoArquivo);
    }
    console.log('Processamento do IBPT concluído.');
  } catch (error) {
    console.error('Erro ao processar dados do IBPT:', error.message);
  }
}

async function processarCest() {
    console.log('Iniciando verificação de atualização do CEST...');
    const url = "https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18";
    const agent = new https.Agent({ rejectUnauthorized: false });

    let metadadosLocais = {};
    if (fs.existsSync(metadataFilePath)) {
        metadadosLocais = JSON.parse(fs.readFileSync(metadataFilePath, 'utf8'));
    }

    try {
        const headResponse = await axios.head(url, { httpsAgent: agent });
        const etagRemoto = headResponse.headers['etag'];
        const lastModifiedRemoto = headResponse.headers['last-modified'];

        if (etagRemoto && etagRemoto === metadadosLocais.etag) {
            console.log('Tabela CEST não foi modificada (ETag idêntico). Pulando atualização.');
            return;
        }
        if (lastModifiedRemoto && lastModifiedRemoto === metadadosLocais.lastModified) {
            console.log('Tabela CEST não foi modificada (Last-Modified idêntico). Pulando atualização.');
            return;
        }

        console.log('Nova versão da tabela CEST encontrada. Iniciando download e processamento completo...');

        const response = await axios.get(url, { httpsAgent: agent });
        const $ = cheerio.load(response.data);
        const todosOsItens = [];

        $('p.A6-1Subtitulo').each((index, element) => {
            let tituloAnexo = $(element).text().trim();
            if (tituloAnexo.startsWith('ANEXO ') && tituloAnexo.length < 15) {
                const tabela = $(element).nextAll('table').first();
                if (tabela.length) {
                    $(tabela).find('tbody tr').each((i, linha) => {
                        if (i === 0) return;
                        const celulas = $(linha).find('td');
                        if (celulas.length >= 4) {
                            const ncmString = $(celulas[2]).text().trim();
                            const ncmArray = ncmString.split(/\s+/).filter(ncm => ncm.length > 0);
                            todosOsItens.push({
                                CEST: $(celulas[1]).text().trim(),
                                NCM_SH: ncmArray,
                                Descricao: $(celulas[3]).text().trim().replace(/\s\s+/g, ' ')
                            });
                        }
                    });
                }
            }
        });

        if (todosOsItens.length > 0) {
            db.exec('DELETE FROM cest_data;');
            const insert = db.prepare('INSERT OR IGNORE INTO cest_data (cest, ncm, descricao) VALUES (?, ?, ?)');
            const inserirMuitosCest = db.transaction((itens) => {
                for (const item of itens) {
                    const cestLimpo = (item.CEST || '').replace(/\./g, '');
                    item.NCM_SH.forEach(ncm => {
                        const ncmLimpo = ncm.replace(/[^\d]/g, '');
                        if (ncmLimpo) {
                            insert.run(cestLimpo, ncmLimpo, item.Descricao);
                        }
                    });
                }
            });
            inserirMuitosCest(todosOsItens);
            console.log(`${todosOsItens.length} registros de CEST potencialmente processados.`);

            const novosMetadados = {
                etag: etagRemoto,
                lastModified: lastModifiedRemoto,
                lastUpdate: new Date().toISOString()
            };
            fs.writeFileSync(metadataFilePath, JSON.stringify(novosMetadados, null, 2), 'utf8');
            console.log('Metadados de controle do CEST foram atualizados.');
        }

    } catch (error) {
        console.error('Erro ao processar dados do CEST:', error.message);
    }
}

async function exportarArquivos() {
  console.log('\nIniciando exportação para JSON e CSV...');
  try {
    const query = `
      SELECT
          i.ncm, i.uf, i.descricao, i.aliqNacional, i.aliqEstadual,
          i.aliqMunicipal, i.aliqImportado, i.vigenciaInicio, i.vigenciaFim,
          (
              SELECT json_group_array(
                  json_object('cest', c.cest, 'ncm', c.ncm, 'descricao', c.descricao)
              )
              FROM cest_data c
              WHERE i.ncm LIKE (c.ncm || '%')
                AND LENGTH(c.ncm) = (
                  SELECT MAX(LENGTH(c2.ncm))
                  FROM cest_data c2
                  WHERE i.ncm LIKE (c2.ncm || '%')
                )
          ) as cests
      FROM ibpt_taxes i
    `;
    
    console.log('Consultando e unindo dados para exportação (isso pode levar um momento)...');
    
    const todosOsDados = db.prepare(query).all();

    if (todosOsDados.length === 0) {
        console.log('Nenhum dado para exportar.');
        return;
    }

    const dadosParaJson = todosOsDados.map(row => ({
        ...row,
        cests: row.cests ? JSON.parse(row.cests) : [] 
    }));

    const nomeArquivoJson = 'openfiscal_completo.json';
    fs.writeFileSync(nomeArquivoJson, JSON.stringify(dadosParaJson, null, 2), 'utf8');
    console.log(`Dados salvos com sucesso em '${nomeArquivoJson}'`);

    const nomeArquivoCsv = 'openfiscal_completo.csv';
    const dadosParaCsv = dadosParaJson.map(item => ({
        ...item,
        cests: item.cests.map(c => c.cest).join(';')
    }));
    const json2csvParser = new Parser({ withBOM: true });
    const csv = json2csvParser.parse(dadosParaCsv);
    fs.writeFileSync(nomeArquivoCsv, csv, 'utf8');
    console.log(`Dados salvos com sucesso em '${nomeArquivoCsv}'`);

  } catch (error) {
    console.error('Erro ao exportar arquivos:', error.message);
  }
}


async function main() {
    criarTabelas();
    await processarIbpt();
    await processarCest();
    //await exportarArquivos();

    db.close();
    console.log("Processo de atualização e exportação finalizado. Conexão com o banco de dados fechada.");
}

if (require.main === module) {
    main().catch(console.error);
}

cron.schedule('0 2 * * 0', () => {
    console.log('Executando tarefa agendada de atualização do banco de dados...');
    main().catch(console.error);
});
