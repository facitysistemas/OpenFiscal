# Testes do OpenFiscal

Este diretório contém todos os testes automatizados para a API OpenFiscal.

## Estrutura dos Testes

### `gtin.test.js`
Testes específicos para funcionalidades de GTIN:
- Validação de obrigatoriedade GTIN por NCM
- Integração GTIN no endpoint principal
- Validação de formato de NCM
- Tratamento de erros

### `api.test.js`
Testes dos endpoints da API:
- Busca semântica por descrição
- Busca por CEST
- Filtro por prefixo NCM
- Consulta de dados IBPT
- Consulta de dados CEST

### `database.test.js`
Testes do banco de dados:
- Processamento de GTIN
- Validação de grupos obrigatórios
- Identificação por palavras-chave
- Tratamento de erros

### `integration.test.js`
Testes de integração:
- Fluxo completo de consulta NCM
- Fluxo de busca semântica
- Fluxo de consulta CEST
- Fluxo de validação GTIN
- Tratamento de erros de integração

### `setup.js`
Configuração global para testes:
- Variáveis de ambiente
- Mocks globais
- Configurações do Jest

## Como Executar os Testes

### Instalar dependências de teste
```bash
npm install
```

### Executar todos os testes
```bash
npm test
```

### Executar testes em modo watch
```bash
npm run test:watch
```

### Executar testes com cobertura
```bash
npm run test:coverage
```

## Cobertura de Testes

Os testes cobrem:
- ✅ Endpoints da API
- ✅ Validação GTIN
- ✅ Processamento de banco de dados
- ✅ Tratamento de erros
- ✅ Integração entre componentes

## Mocks Utilizados

- `better-sqlite3`: Mock do banco de dados
- `fs`: Mock do sistema de arquivos
- `axios`: Mock para requisições HTTP
- `cheerio`: Mock para parsing HTML
- `csvtojson`: Mock para conversão CSV

## Estrutura de Testes

Cada arquivo de teste segue o padrão:
```javascript
describe('Grupo de Testes', () => {
  beforeEach(() => {
    // Configuração antes de cada teste
  });

  test('deve fazer algo específico', async () => {
    // Arrange
    // Act
    // Assert
  });
});
```

## Exemplos de Teste

### Teste de Endpoint
```javascript
test('deve retornar dados para NCM válido', async () => {
  const response = await request(app)
    .get('/sp/21069090')
    .expect(200);

  expect(response.body).toHaveProperty('Codigo', '21069090');
});
```

### Teste de Validação
```javascript
test('deve validar obrigatoriedade GTIN', async () => {
  const response = await request(app)
    .get('/ncm/21069090/gtin-obrigatorio')
    .expect(200);

  expect(response.body.gtinObrigatorio).toBe(true);
});
```

## Manutenção dos Testes

- Atualizar testes quando adicionar novos endpoints
- Manter mocks sincronizados com a implementação
- Adicionar testes para novos casos de erro
- Verificar cobertura de código regularmente
