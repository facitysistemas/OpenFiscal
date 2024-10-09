const fs = require('fs');
const path = require('path');
const axios = require('axios');
const csv = require('csvtojson');
const cheerio = require('cheerio');
const cron = require('node-cron');

// URL do diretório SVN com os arquivos CSV
const svnUrl = 'http://svn.code.sf.net/p/acbr/code/trunk2/Exemplos/ACBrTCP/ACBrIBPTax/tabela/';

// Diretório para salvar os arquivos CSV
const csvDir = path.join(__dirname, 'csv_files');

// Cria o diretório csv_files se não existir
if (!fs.existsSync(csvDir)) {
  fs.mkdirSync(csvDir);
}

// Função para baixar um arquivo com várias tentativas
async function downloadFileWithRetries(url, filePath, maxRetries = 5, delay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Tentando baixar (${attempt}/${maxRetries}): ${url}`);
      const response = await axios.get(url, { responseType: 'stream' });
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      console.log(`Arquivo ${filePath} baixado com sucesso.`);
      return true;
    } catch (error) {
      console.error(`Erro ao baixar o arquivo (tentativa ${attempt}): ${error.message}`);
      if (attempt < maxRetries) {
        console.log(`Esperando ${delay / 1000} segundos antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`Não foi possível baixar o arquivo: ${url} após ${maxRetries} tentativas.`);
  return false;
}

// Função para gerar o JSON
async function generateJSON() {
  console.log(`[${new Date().toLocaleString()}] Iniciando a geração do JSON...`);
  
  // Objeto final que será convertido para JSON
  let finalData = {
    c: '',   // Chave
    v: '',   // Versão
    f: '',   // Fonte
    vI: '',  // Vigência Início (global)
    vF: '',  // Vigência Fim (global)
    d: {}    // Dados
  };

  try {
    // Obter a lista de arquivos no diretório SVN
    const svnIndexResponse = await axios.get(svnUrl);

    // Parsear o conteúdo HTML para extrair os links dos arquivos CSV
    const $ = cheerio.load(svnIndexResponse.data);

    const svnCsvFiles = [];

    $('a').each((index, element) => {
      const href = $(element).attr('href');
      if (href && href.endsWith('.csv')) {
        const fileName = href.split('/').pop();
        svnCsvFiles.push(fileName);
      }
    });

    // Obter a lista de arquivos CSV locais
    let localCsvFiles = [];
    if (fs.existsSync(csvDir)) {
      localCsvFiles = fs.readdirSync(csvDir).filter(file => file.endsWith('.csv'));
    }

    // Ordenar as listas para facilitar a comparação
    svnCsvFiles.sort();
    localCsvFiles.sort();

    // Comparar as listas de arquivos
    const filesAreEqual = JSON.stringify(svnCsvFiles) === JSON.stringify(localCsvFiles);

    if (!filesAreEqual) {
      console.log('Os arquivos locais estão desatualizados ou foram adicionados novos arquivos. Excluindo arquivos antigos e baixando novos arquivos do SVN...');

      // Excluir arquivos CSV locais antigos
      localCsvFiles.forEach(file => {
        const filePath = path.join(csvDir, file);
        fs.unlinkSync(filePath);
        console.log(`Arquivo ${file} excluído.`);
      });

      // Baixar os novos arquivos CSV do SVN
      for (const fileName of svnCsvFiles) {
        const fileUrl = `${svnUrl}${fileName}`;
        const filePath = path.join(csvDir, fileName);

        const success = await downloadFileWithRetries(fileUrl, filePath);
        if (!success) {
          console.error('Falha ao baixar todos os arquivos CSV. Abortando a geração do JSON.');
          return;
        }
      }
    } else {
      console.log('Os arquivos locais estão atualizados. Não é necessário baixar novamente.');
    }

    // Obter a lista atualizada de arquivos CSV locais
    const files = fs.readdirSync(csvDir).filter(file => file.endsWith('.csv'));

    for (const file of files) {
      // Extrai o UF do nome do arquivo usando expressão regular
      const ufMatch = file.match(/TabelaIBPTax(\w{2})/i);
      if (!ufMatch) continue;
      const uf = ufMatch[1].toUpperCase(); // Extrai o UF do nome do arquivo
      const csvFilePath = path.join(csvDir, file);

      console.log(`Processando arquivo: ${file}`);

      // Converte o CSV em JSON
      const jsonArray = await csv({
        delimiter: ';',
        noheader: false,
        trim: true,
        headers: [
          'codigo',
          'ex',
          'tipo',
          'descricao',
          'nacionalfederal',
          'importadosfederal',
          'estadual',
          'municipal',
          'vigenciainicio',
          'vigenciafim',
          'chave',
          'versao',
          'fonte'
        ]
      }).fromFile(csvFilePath);

      jsonArray.forEach(item => {
        // Define a chave, versão, fonte e vigência apenas uma vez
        if (!finalData.c) {
          finalData.c = item.chave;    // Chave
          finalData.v = item.versao;   // Versão
          finalData.f = item.fonte;    // Fonte
          finalData.vI = item.vigenciainicio || ''; // Vigência Início
          finalData.vF = item.vigenciafim || '';    // Vigência Fim
        }

        const codigo = item.codigo;
        const ex = item.ex || '0';
        const tipo = item.tipo || '';
        const descricao = item.descricao || '';

        // Cria uma chave única para cada produto (codigo + ex + tipo)
        const key = `${codigo}-${ex}-${tipo}`;

        // Se o produto ainda não existe, adiciona ao finalData.d
        if (!finalData.d[key]) {
          finalData.d[key] = {
            c: codigo,    // Código
            e: parseInt(ex),  // EX
            t: tipo,      // Tipo
            d: descricao, // Descrição
            i: {}         // Impostos
          };
        }

        // Adiciona os impostos para o UF atual
        finalData.d[key].i[uf] = {
          n: parseFloat(item.nacionalfederal.replace(',', '.')) || 0, // Nacional
          im: parseFloat(item.importadosfederal.replace(',', '.')) || 0, // Importado
          es: parseFloat(item.estadual.replace(',', '.')) || 0, // Estadual
          m: parseFloat(item.municipal.replace(',', '.')) || 0   // Municipal
        };
      });
    }

    // Serializa o objeto finalData em JSON
    const jsonString = JSON.stringify(finalData);

    // Escreve o resultado em um arquivo JSON
    fs.writeFileSync('resultado_otimizado.json', jsonString, 'utf8');

    console.log('Arquivo JSON otimizado gerado com sucesso!');
  } catch (error) {
    console.error('Erro ao gerar o JSON:', error);
  } finally {
    console.log(`[${new Date().toLocaleString()}] Geração do JSON concluída.`);
  }
}

// Agendar a execução diária às 2:00 AM
cron.schedule('0 2 * * *', () => {
  generateJSON();
}, {
  scheduled: true,
  timezone: "America/Sao_Paulo" // Ajuste para o seu fuso horário
});

// Executar imediatamente ao iniciar o script
generateJSON();