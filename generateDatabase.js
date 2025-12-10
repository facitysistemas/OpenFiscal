const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');
const csv = require('csvtojson');
const Database = require('better-sqlite3');
const https = require('https');
const { Parser } = require('json2csv');

// Configuração de retry (Modelo Opus 4.5)
const RETRY_CONFIG = {
  maxRetries: 5,
  initialDelay: 1000, // 1 segundo
  maxDelay: 30000, // 30 segundos
  timeout: 60000, // 60 segundos
  backoffMultiplier: 2
};

// Função de retry com backoff exponencial
async function retryWithBackoff(fn, context = 'operação', retries = RETRY_CONFIG.maxRetries) {
  let lastError;
  let delay = RETRY_CONFIG.initialDelay;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isNetworkError = error.code === 'EAI_AGAIN' || 
                            error.code === 'ETIMEDOUT' || 
                            error.code === 'ECONNRESET' ||
                            error.code === 'ENOTFOUND' ||
                            error.message.includes('timeout') ||
                            error.message.includes('getaddrinfo');
      
      if (!isNetworkError || attempt === retries) {
        throw error;
      }
      
      const actualDelay = Math.min(delay, RETRY_CONFIG.maxDelay);
      console.warn(`[${context}] Tentativa ${attempt}/${retries} falhou: ${error.message}`);
      console.warn(`[${context}] Aguardando ${actualDelay}ms antes da próxima tentativa...`);
      
      await new Promise(resolve => setTimeout(resolve, actualDelay));
      delay *= RETRY_CONFIG.backoffMultiplier;
    }
  }
  
  throw lastError;
}

// Função auxiliar para criar instância do axios com timeout e retry
function createAxiosInstance(timeout = RETRY_CONFIG.timeout) {
  return axios.create({
    timeout: timeout,
    httpsAgent: new https.Agent({ 
      rejectUnauthorized: false,
      keepAlive: true,
      keepAliveMsecs: 1000
    }),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
}

const db = new Database('openfiscal.db');
db.pragma('journal_mode = WAL');
const metadataFilePath = path.join(__dirname, 'cest_metadata.json');

function criarTabelas() {
  console.log('Verificando e criando tabelas, se necessário...');
  // Tabela principal de impostos do IBPT
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
  // Tabela de dados do CEST
  db.exec(`
    CREATE TABLE IF NOT EXISTS cest_data (
      cest TEXT NOT NULL,
      ncm TEXT NOT NULL,
      descricao TEXT,
      PRIMARY KEY (cest, ncm)
    );
  `);
  // Índices para performance
  db.exec('CREATE INDEX IF NOT EXISTS idx_ncm_ibpt ON ibpt_taxes (ncm);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ncm_cest ON cest_data (ncm);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_cest_data_cest ON cest_data (cest);');

  // Tabela virtual FTS5 para busca otimizada por texto completo.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS ibpt_search USING fts5(
      ncm, 
      descricao, 
      content='ibpt_taxes', 
      content_rowid='rowid',
      tokenize = 'porter unicode61'
    );
  `);

  // Gatilhos (Triggers) para manter a tabela de busca sincronizada.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS ibpt_taxes_after_insert AFTER INSERT ON ibpt_taxes BEGIN
      INSERT INTO ibpt_search(rowid, ncm, descricao) VALUES (new.rowid, new.ncm, new.descricao);
    END;
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS ibpt_taxes_after_delete AFTER DELETE ON ibpt_taxes BEGIN
      INSERT INTO ibpt_search(ibpt_search, rowid, ncm, descricao) VALUES ('delete', old.rowid, old.ncm, old.descricao);
    END;
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS ibpt_taxes_after_update AFTER UPDATE ON ibpt_taxes BEGIN
      INSERT INTO ibpt_search(ibpt_search, rowid, ncm, descricao) VALUES ('delete', old.rowid, old.ncm, old.descricao);
      INSERT INTO ibpt_search(rowid, ncm, descricao) VALUES (new.rowid, new.ncm, new.descricao);
    END;
  `);

  console.log('Tabelas e índice de busca prontos.');
}

async function processarIbpt() {
  console.log('Iniciando processamento dos dados do IBPT...');
  const svnUrl = 'http://svn.code.sf.net/p/acbr/code/trunk2/Exemplos/ACBrTCP/ACBrIBPTax/tabela/';
  
  const axiosInstance = createAxiosInstance();
  
  // Criar tabela temporária para armazenar os novos dados antes de substituir os antigos
  // Isso garante que os dados existentes sejam preservados se houver falha
  db.exec(`
    CREATE TABLE IF NOT EXISTS ibpt_taxes_temp (
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
  
  // Limpar tabela temporária antes de começar
  db.exec('DELETE FROM ibpt_taxes_temp;');
  
  const insert = db.prepare(`
    INSERT OR REPLACE INTO ibpt_taxes_temp (ncm, uf, ex, tipo, descricao, aliqNacional, aliqEstadual, aliqMunicipal, aliqImportado, vigenciaInicio, vigenciaFim, chave, versao, fonte)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const inserirMuitos = db.transaction((linhas, uf) => {
    for (const linha of linhas) {
      const ncmLimpo = (linha.codigo || '').replace(/\./g, '');
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
    // Usar retry para buscar a lista de arquivos
    const response = await retryWithBackoff(
      async () => await axiosInstance.get(svnUrl),
      'IBPT - Listagem de arquivos'
    );
    
    const $ = cheerio.load(response.data);
    const csvFiles = [];
    $('a[href$=".csv"]').each((i, link) => {
      csvFiles.push($(link).attr('href'));
    });

    if (csvFiles.length === 0) {
      console.warn('Nenhum arquivo CSV encontrado na página do IBPT.');
      console.warn('Mantendo dados existentes no banco de dados.');
      db.exec('DROP TABLE IF EXISTS ibpt_taxes_temp;');
      return;
    }

    console.log(`Encontrados ${csvFiles.length} arquivos CSV para processar.`);

    let sucessos = 0;
    let falhas = 0;
    let totalRegistros = 0;

    for (const file of csvFiles) {
      const match = /TabelaIBPTax([A-Z]{2})/.exec(file);
      if (!match || !match[1]) {
        console.warn(`Não foi possível extrair a UF do arquivo: ${file}. Pulando.`);
        continue;
      }
      const ufDoArquivo = match[1];
      
      try {
        console.log(`Processando IBPT para a UF: ${ufDoArquivo} (arquivo: ${file})...`);
        
        const fileUrl = svnUrl + file;
        
        // Usar retry para baixar cada arquivo
        const csvResponse = await retryWithBackoff(
          async () => await axiosInstance.get(fileUrl, { responseType: 'stream' }),
          `IBPT - Download ${ufDoArquivo}`
        );
        
        const jsonArray = await csv({
          delimiter: ';',
          headers: ['codigo', 'ex', 'tipo', 'descricao', 'nacionalfederal', 'importadosfederal', 'estadual', 'municipal', 'vigenciainicio', 'vigenciafim', 'chave', 'versao', 'fonte']
        }).fromStream(csvResponse.data);
        
        inserirMuitos(jsonArray, ufDoArquivo);
        sucessos++;
        totalRegistros += jsonArray.length;
        console.log(`✓ UF ${ufDoArquivo} processada com sucesso (${jsonArray.length} registros).`);
      } catch (error) {
        falhas++;
        console.error(`✗ Erro ao processar UF ${ufDoArquivo} (${file}):`, error.message);
        // Continua processando outras UFs mesmo se uma falhar
      }
    }
    
    console.log(`\nProcessamento do IBPT concluído: ${sucessos} UFs processadas, ${falhas} falhas, ${totalRegistros} registros totais.`);

    // Só substitui os dados antigos se tiver processado pelo menos algumas UFs com sucesso
    // Critério: pelo menos 10 UFs ou mais de 50% das UFs disponíveis
    const minUfsSucesso = Math.max(10, Math.floor(csvFiles.length * 0.5));
    
    if (sucessos >= minUfsSucesso && totalRegistros > 0) {
      console.log('Substituindo dados antigos pelos novos dados processados...');
      
      // Usar transação para garantir atomicidade
      const substituirDados = db.transaction(() => {
        db.exec('DELETE FROM ibpt_taxes;');
        db.exec('INSERT INTO ibpt_taxes SELECT * FROM ibpt_taxes_temp;');
        db.exec('DELETE FROM ibpt_taxes_temp;');
        db.exec('DROP TABLE ibpt_taxes_temp;');
      });
      
      substituirDados();
      
      // Reconstrói o índice FTS5 para garantir a sincronização
      console.log('Reconstruindo índice de busca semântica...');
      db.exec(`INSERT INTO ibpt_search(ibpt_search) VALUES('rebuild');`);
      console.log('✓ Índice de busca reconstruído com sucesso.');
      console.log('✓ Dados do IBPT atualizados com sucesso!');
    } else {
      console.warn(`⚠️  Apenas ${sucessos} UFs foram processadas (mínimo necessário: ${minUfsSucesso}).`);
      console.warn('⚠️  Mantendo dados existentes no banco de dados para garantir continuidade do serviço.');
      console.warn('⚠️  Os dados antigos permanecem intactos e a API continuará funcionando normalmente.');
      db.exec('DROP TABLE IF EXISTS ibpt_taxes_temp;');
    }

  } catch (error) {
    console.error('Erro crítico ao processar dados do IBPT:', error.message);
    console.error('Detalhes:', {
      code: error.code,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    });
    console.warn('⚠️  Mantendo dados existentes no banco de dados.');
    db.exec('DROP TABLE IF EXISTS ibpt_taxes_temp;');
    // Não re-lança o erro para que o processo continue com outras fontes
    console.warn('⚠️  Continuando com o processamento de outras fontes...');
  }
}

async function processarCest() {
    console.log('Iniciando verificação de atualização do CEST...');
    const url = "https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18";
    const axiosInstance = createAxiosInstance();

    let metadadosLocais = {};
    if (fs.existsSync(metadataFilePath)) {
        try {
            metadadosLocais = JSON.parse(fs.readFileSync(metadataFilePath, 'utf8'));
        } catch (error) {
            console.warn('Erro ao ler metadados locais do CEST. Continuando sem verificação de cache.');
        }
    }

    try {
        // Verificar se há atualização disponível com retry
        let etagRemoto, lastModifiedRemoto;
        try {
            const headResponse = await retryWithBackoff(
                async () => await axiosInstance.head(url),
                'CEST - Verificação de atualização'
            );
            etagRemoto = headResponse.headers['etag'];
            lastModifiedRemoto = headResponse.headers['last-modified'];
        } catch (error) {
            console.warn('Não foi possível verificar atualização do CEST via HEAD. Tentando download completo...');
        }

        if (etagRemoto && etagRemoto === metadadosLocais.etag) {
            console.log('Tabela CEST não foi modificada (ETag idêntico). Pulando atualização.');
            return;
        }
        if (lastModifiedRemoto && lastModifiedRemoto === metadadosLocais.lastModified) {
            console.log('Tabela CEST não foi modificada (Last-Modified idêntico). Pulando atualização.');
            return;
        }

        if (etagRemoto || lastModifiedRemoto) {
            console.log('Nova versão da tabela CEST encontrada. Iniciando download e processamento completo...');
        } else {
            console.log('Iniciando download e processamento do CEST...');
        }

        // Download completo com retry
        const response = await retryWithBackoff(
            async () => await axiosInstance.get(url),
            'CEST - Download completo'
        );
        
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
            // Criar tabela temporária para garantir que os dados antigos sejam preservados em caso de falha
            db.exec(`
                CREATE TABLE IF NOT EXISTS cest_data_temp (
                    cest TEXT NOT NULL,
                    ncm TEXT NOT NULL,
                    descricao TEXT,
                    PRIMARY KEY (cest, ncm)
                );
            `);
            db.exec('DELETE FROM cest_data_temp;');
            
            const insert = db.prepare('INSERT OR IGNORE INTO cest_data_temp (cest, ncm, descricao) VALUES (?, ?, ?)');
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
            
            // Verificar se há dados válidos na tabela temporária
            const countTemp = db.prepare('SELECT COUNT(*) as total FROM cest_data_temp').get();
            const totalRegistros = countTemp.total;
            
            if (totalRegistros > 0) {
                // Substituir dados antigos apenas se houver dados válidos
                const substituirDados = db.transaction(() => {
                    db.exec('DELETE FROM cest_data;');
                    db.exec('INSERT INTO cest_data SELECT * FROM cest_data_temp;');
                    db.exec('DELETE FROM cest_data_temp;');
                    db.exec('DROP TABLE cest_data_temp;');
                });
                substituirDados();
                
                console.log(`✓ ${totalRegistros} registros de CEST processados e salvos com sucesso.`);

                const novosMetadados = {
                    etag: etagRemoto || null,
                    lastModified: lastModifiedRemoto || null,
                    lastUpdate: new Date().toISOString()
                };
                fs.writeFileSync(metadataFilePath, JSON.stringify(novosMetadados, null, 2), 'utf8');
                console.log('✓ Metadados de controle do CEST foram atualizados.');
            } else {
                console.warn('⚠️  Nenhum registro válido foi processado. Mantendo dados existentes.');
                db.exec('DROP TABLE IF EXISTS cest_data_temp;');
            }
        } else {
            console.warn('⚠️  Nenhum item de CEST foi encontrado na página. Verifique se a estrutura HTML mudou.');
            console.warn('⚠️  Mantendo dados existentes no banco de dados.');
        }

    } catch (error) {
        console.error('Erro crítico ao processar dados do CEST:', error.message);
        console.error('Detalhes:', {
            code: error.code,
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 3).join('\n')
        });
        // Não re-lança o erro para que o processamento continue mesmo se o CEST falhar
        console.warn('O processamento continuará mesmo com a falha do CEST.');
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


async function processarGTIN() {
    console.log('Iniciando processamento da obrigatoriedade GTIN...');
    
    // Função para verificar obrigatoriedade GTIN
    function verificarObrigatoriedadeGTIN(ncm, descricao) {
        const grupo = ncm.substring(0, 4);
        
        // Grupos obrigatórios conhecidos (baseado na legislação)
        const gruposObrigatorios = [
            '2106', // Preparações alimentícias
            '2202', // Bebidas
            '3003', // Medicamentos
            '3304', // Produtos de higiene
            '3401', // Sabões e detergentes
            '3923'  // Embalagens plásticas
        ];
        
        // Verificar grupos obrigatórios
        if (gruposObrigatorios.includes(grupo)) {
            return true;
        }
        
        // Palavras-chave na descrição que indicam obrigatoriedade
        const palavrasChave = [
            'embalado',
            'comercializado',
            'identificável',
            'rastreável',
            'código de barras',
            'ean',
            'gtin'
        ];
        
        const descricaoLower = descricao.toLowerCase();
        return palavrasChave.some(palavra => descricaoLower.includes(palavra));
    }
    
    try {
        // Buscar todos os NCMs com descrições
        const todosNCMs = db.prepare('SELECT DISTINCT ncm, descricao FROM ibpt_taxes').all();
        
        if (todosNCMs.length === 0) {
            console.warn('⚠️  Nenhum NCM encontrado no banco de dados. Pulando processamento GTIN.');
            console.warn('⚠️  Mantendo dados existentes de GTIN.');
            return;
        }
        
        console.log(`Analisando ${todosNCMs.length} NCMs para obrigatoriedade GTIN...`);
        
        // Aplicar regras de validação
        const ncmObrigatorios = todosNCMs.filter(item => 
            verificarObrigatoriedadeGTIN(item.ncm, item.descricao)
        );
        
        console.log(`${ncmObrigatorios.length} NCMs identificados como obrigatórios para GTIN`);
        
        // Criar tabela de controle (se não existir)
        db.exec(`
            CREATE TABLE IF NOT EXISTS gtin_obrigatorio (
                ncm TEXT PRIMARY KEY,
                descricao TEXT,
                grupo TEXT,
                data_vigencia TEXT DEFAULT '2025-10-01',
                data_processamento DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Criar tabela temporária para garantir preservação dos dados em caso de falha
        db.exec(`
            CREATE TABLE IF NOT EXISTS gtin_obrigatorio_temp (
                ncm TEXT PRIMARY KEY,
                descricao TEXT,
                grupo TEXT,
                data_vigencia TEXT DEFAULT '2025-10-01',
                data_processamento DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.exec('DELETE FROM gtin_obrigatorio_temp');
        
        // Inserir NCMs obrigatórios na tabela temporária
        const insert = db.prepare(`
            INSERT INTO gtin_obrigatorio_temp (ncm, descricao, grupo) 
            VALUES (?, ?, ?)
        `);
        
        const inserirMuitos = db.transaction((itens) => {
            for (const item of itens) {
                const grupo = item.ncm.substring(0, 4);
                insert.run(item.ncm, item.descricao, grupo);
            }
        });
        
        inserirMuitos(ncmObrigatorios);
        
        // Verificar se há dados válidos antes de substituir
        const countTemp = db.prepare('SELECT COUNT(*) as total FROM gtin_obrigatorio_temp').get();
        
        if (countTemp.total > 0) {
            // Substituir dados antigos apenas se houver dados válidos
            const substituirDados = db.transaction(() => {
                db.exec('DELETE FROM gtin_obrigatorio');
                db.exec('INSERT INTO gtin_obrigatorio SELECT * FROM gtin_obrigatorio_temp');
                db.exec('DELETE FROM gtin_obrigatorio_temp');
                db.exec('DROP TABLE gtin_obrigatorio_temp');
            });
            substituirDados();
            console.log('✓ Processamento GTIN concluído com sucesso.');
        } else {
            console.warn('⚠️  Nenhum registro GTIN foi gerado. Mantendo dados existentes.');
            db.exec('DROP TABLE IF EXISTS gtin_obrigatorio_temp');
        }
        
    } catch (error) {
        console.error('Erro ao processar GTIN:', error.message);
        console.warn('⚠️  Mantendo dados existentes de GTIN no banco de dados.');
        db.exec('DROP TABLE IF EXISTS gtin_obrigatorio_temp');
    }
}

async function main() {
    let erros = [];
    
    try {
        criarTabelas();
        
        // Processar IBPT
        try {
            await processarIbpt();
        } catch (error) {
            erros.push({ fonte: 'IBPT', erro: error.message });
            console.error('Falha ao processar IBPT, mas continuando com outras fontes...');
        }
        
        // Processar CEST
        try {
            await processarCest();
        } catch (error) {
            erros.push({ fonte: 'CEST', erro: error.message });
            console.error('Falha ao processar CEST, mas continuando com outras fontes...');
        }
        
        // Processar GTIN (não depende de fontes externas)
        try {
            await processarGTIN();
        } catch (error) {
            erros.push({ fonte: 'GTIN', erro: error.message });
            console.error('Falha ao processar GTIN:', error.message);
        }
        
        //await exportarArquivos();

        if (erros.length > 0) {
            console.warn('\n⚠️  Algumas fontes falharam durante o processamento:');
            erros.forEach(e => console.warn(`  - ${e.fonte}: ${e.erro}`));
            console.warn('\n📌 IMPORTANTE: Os dados existentes foram preservados.');
            console.warn('📌 A API continuará funcionando normalmente com os dados anteriores.');
            console.warn('📌 Tente executar a atualização novamente mais tarde.');
        } else {
            console.log('\n✓ Todos os processos foram concluídos com sucesso!');
            console.log('✓ Banco de dados atualizado e pronto para uso.');
        }

    } catch (error) {
        console.error('\n❌ Erro crítico no processo principal:', error.message);
        console.warn('\n📌 IMPORTANTE: Os dados existentes foram preservados.');
        console.warn('📌 A API continuará funcionando normalmente com os dados anteriores.');
        // Não re-lança o erro para não quebrar o cron job
    } finally {
        db.close();
        console.log("\n📦 Processo de atualização finalizado. Conexão com o banco de dados fechada.");
        console.log("🌐 A API está pronta para receber requisições.");
    }
}

if (require.main === module) {
    main().catch(console.error);
}

cron.schedule('0 2 * * 0', () => {
    console.log('Executando tarefa agendada de atualização do banco de dados...');
    main().catch(console.error);
});
