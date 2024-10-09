const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');

// Caminho para o arquivo JSON
const dataPath = path.join(__dirname, 'resultado_otimizado.json');

// Variável para armazenar os dados
let finalData = {};

// Cria um índice para facilitar a busca por NCM
const ncmIndex = {};

// Função para carregar o JSON
function loadJSON() {
  try {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    finalData = JSON.parse(rawData);
    console.log(`[${new Date().toLocaleString()}] Dados JSON carregados com sucesso.`);
    createIndex();
  } catch (error) {
    console.error('Erro ao carregar o JSON:', error.message);
  }
}

// Carregar o JSON inicialmente
loadJSON();

// Monitorar alterações no arquivo JSON
fs.watch(dataPath, (eventType, filename) => {
  if (eventType === 'change') {
    console.log(`[${new Date().toLocaleString()}] Detected change in JSON file. Reloading...`);
    loadJSON();
  }
});

// Função para criar o índice
function createIndex() {
  // Limpa o índice atual
  for (let key in ncmIndex) {
    delete ncmIndex[key];
  }

  Object.keys(finalData.d).forEach(key => {
    const produto = finalData.d[key];
    if (!ncmIndex[produto.c]) {
      ncmIndex[produto.c] = [];
    }
    ncmIndex[produto.c].push(produto);
  });
  console.log(`[${new Date().toLocaleString()}] Índice de NCM criado/atualizado.`);
}

// Função para formatar o uso de memória
// function formatMemoryUsage(data) {
//   return `${Math.round((data / 1024 / 1024) * 100) / 100} MB`;
// }

// Exibe o uso de memória ao iniciar o servidor
// const memoryUsage = process.memoryUsage();
// console.log('Uso de memória inicial:');
// console.log(`RSS: ${formatMemoryUsage(memoryUsage.rss)}`);
// console.log(`Heap Total: ${formatMemoryUsage(memoryUsage.heapTotal)}`);
// console.log(`Heap Usado: ${formatMemoryUsage(memoryUsage.heapUsed)}`);
// console.log(`External: ${formatMemoryUsage(memoryUsage.external)}`);
// console.log(`Array Buffers: ${formatMemoryUsage(memoryUsage.arrayBuffers)}`);

// // Opcional: Exibir o uso de memória em intervalos regulares
// setInterval(() => {
//   const memoryUsage = process.memoryUsage();
//   console.log('Uso de memória atual:');
//   console.log(`RSS: ${formatMemoryUsage(memoryUsage.rss)}`);
//   console.log(`Heap Total: ${formatMemoryUsage(memoryUsage.heapTotal)}`);
//   console.log(`Heap Usado: ${formatMemoryUsage(memoryUsage.heapUsed)}`);
//   console.log(`External: ${formatMemoryUsage(memoryUsage.external)}`);
//   console.log(`Array Buffers: ${formatMemoryUsage(memoryUsage.arrayBuffers)}`);
//   console.log('-----------------------------');
// }, 60000); // Intervalo em milissegundos (60000 ms = 1 minuto)

// Endpoint /:uf/:ncm
app.get('/:uf/:ncm', (req, res) => {
  const { uf, ncm } = req.params;
  const ufUpper = uf.toUpperCase();

  // Busca os produtos com o código NCM fornecido
  const produtos = ncmIndex[ncm];

  if (produtos && produtos.length > 0) {
    // Procura um produto que tenha impostos para o UF especificado
    const produto = produtos.find(p => p.i[ufUpper]);

    if (produto) {
      const impostos = produto.i[ufUpper];

      // Monta o objeto de resposta conforme o formato desejado
      const response = {
        Codigo: produto.c,
        UF: ufUpper,
        EX: produto.e,
        Descricao: produto.d,
        Nacional: impostos.n,
        Estadual: impostos.es,
        Importado: impostos.im,
        Municipal: impostos.m,
        Tipo: produto.t,
        VigenciaInicio: produto.vI || finalData.vI,
        VigenciaFim: produto.vF || finalData.vF,
        Chave: finalData.c,
        Versao: finalData.v,
        Fonte: finalData.f
      };

      res.json(response);
    } else {
      res.status(404).json({ error: 'UF não encontrado para o NCM especificado' });
    }
  } else {
    res.status(404).json({ error: 'NCM não encontrado' });
  }
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Ocorreu um erro no servidor.' });
});

// Inicia o servidor na porta desejada (por exemplo, 3000)
const PORT = process.env.PORT || 7389;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});