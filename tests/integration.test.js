const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Mock do banco de dados para testes de integração
const mockDb = {
  prepare: jest.fn(() => ({
    get: jest.fn(),
    all: jest.fn(),
    run: jest.fn()
  }))
};

// Mock do better-sqlite3
jest.mock('better-sqlite3', () => {
  return jest.fn(() => mockDb);
});

// Mock do fs para verificar se o banco existe
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true)
}));

// Importar o app após os mocks
const app = require('../app');

describe('Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Fluxo completo de consulta NCM', () => {
    test('deve retornar dados completos para NCM com GTIN obrigatório', async () => {
      // Mock dos dados IBPT
      const mockIbptData = {
        ncm: '21069090',
        uf: 'SP',
        ex: '001',
        descricao: 'Preparações alimentícias diversas',
        aliqNacional: 38.41,
        aliqEstadual: 12.00,
        aliqImportado: 38.41,
        aliqMunicipal: 0.00,
        tipo: 'NBS',
        vigenciaInicio: '2023-01-01',
        vigenciaFim: '2023-12-31',
        chave: 'AAAA-BBBB',
        versao: '24.2.A',
        fonte: 'IBPT'
      };

      // Mock dos dados CEST
      const mockCestData = [
        {
          cest: '1400400',
          ncm: '210690',
          descricao: 'Preparações alimentícias diversas'
        }
      ];

      // Mock dos dados GTIN
      const mockGtinObrigatorio = {
        ncm: '21069090',
        descricao: 'Preparações alimentícias diversas',
        grupo: '2106'
      };

      // Configurar mocks
      const ibptStmt = mockDb.prepare();
      const cestStmt = mockDb.prepare();
      const gtinStmt = mockDb.prepare();

      ibptStmt.get.mockReturnValue(mockIbptData);
      cestStmt.all.mockReturnValue(mockCestData);
      gtinStmt.get.mockReturnValue(mockGtinObrigatorio);

      const response = await request(app)
        .get('/sp/21069090')
        .expect(200);

      // Verificar estrutura da resposta
      expect(response.body).toHaveProperty('Codigo', '21069090');
      expect(response.body).toHaveProperty('UF', 'SP');
      expect(response.body).toHaveProperty('Descricao', 'Preparações alimentícias diversas');
      expect(response.body).toHaveProperty('Nacional', 38.41);
      expect(response.body).toHaveProperty('Estadual', 12.00);
      expect(response.body).toHaveProperty('Importado', 38.41);
      expect(response.body).toHaveProperty('Municipal', 0.00);
      expect(response.body).toHaveProperty('TotalTributosNacionais', 50.41);
      expect(response.body).toHaveProperty('TotalTributosImportados', 50.41);
      expect(response.body).toHaveProperty('Tipo', 'NBS');
      expect(response.body).toHaveProperty('VigenciaInicio', '2023-01-01');
      expect(response.body).toHaveProperty('VigenciaFim', '2023-12-31');
      expect(response.body).toHaveProperty('Chave', 'AAAA-BBBB');
      expect(response.body).toHaveProperty('Versao', '24.2.A');
      expect(response.body).toHaveProperty('Fonte', 'IBPT');
      expect(response.body).toHaveProperty('CESTs', mockCestData);
      expect(response.body).toHaveProperty('GTINObrigatorio', true);
      expect(response.body).toHaveProperty('DataVigenciaGTIN', '2025-10-01');
    });

    test('deve retornar dados completos para NCM sem GTIN obrigatório', async () => {
      // Mock dos dados IBPT
      const mockIbptData = {
        ncm: '85171200',
        uf: 'SP',
        ex: '001',
        descricao: 'Telefones celulares',
        aliqNacional: 38.41,
        aliqEstadual: 12.00,
        aliqImportado: 38.41,
        aliqMunicipal: 0.00,
        tipo: 'NBS',
        vigenciaInicio: '2023-01-01',
        vigenciaFim: '2023-12-31',
        chave: 'AAAA-BBBB',
        versao: '24.2.A',
        fonte: 'IBPT'
      };

      // Mock dos dados CEST
      const mockCestData = [];

      // Configurar mocks
      const ibptStmt = mockDb.prepare();
      const cestStmt = mockDb.prepare();
      const gtinStmt = mockDb.prepare();

      ibptStmt.get.mockReturnValue(mockIbptData);
      cestStmt.all.mockReturnValue(mockCestData);
      gtinStmt.get.mockReturnValue(null); // NCM não obrigatório

      const response = await request(app)
        .get('/sp/85171200')
        .expect(200);

      // Verificar estrutura da resposta
      expect(response.body).toHaveProperty('Codigo', '85171200');
      expect(response.body).toHaveProperty('UF', 'SP');
      expect(response.body).toHaveProperty('Descricao', 'Telefones celulares');
      expect(response.body).toHaveProperty('CESTs', []);
      expect(response.body).toHaveProperty('GTINObrigatorio', false);
      expect(response.body).toHaveProperty('DataVigenciaGTIN', null);
    });
  });

  describe('Fluxo de busca semântica', () => {
    test('deve retornar NCMs relevantes para busca por descrição', async () => {
      const mockSearchResults = [
        {
          ncm: '22021000',
          descricao: 'Águas, incluindo as águas minerais e as águas gaseificadas'
        },
        {
          ncm: '21069010',
          descricao: 'Preparações do tipo utilizado para elaboração de bebidas'
        }
      ];

      const mockPrepare = mockDb.prepare();
      mockPrepare.all.mockReturnValue(mockSearchResults);

      const response = await request(app)
        .get('/search/refrigerante')
        .expect(200);

      expect(response.body).toEqual(mockSearchResults);
    });

    test('deve retornar NCMs para busca por prefixo', async () => {
      const mockFilterResults = [
        {
          ncm: '21069010',
          descricao: 'Preparações do tipo utilizado para elaboração de bebidas'
        },
        {
          ncm: '21069090',
          descricao: 'Preparações alimentícias diversas'
        }
      ];

      const mockPrepare = mockDb.prepare();
      mockPrepare.all.mockReturnValue(mockFilterResults);

      const response = await request(app)
        .get('/ncm/filter/2106')
        .expect(200);

      expect(response.body).toEqual(mockFilterResults);
    });
  });

  describe('Fluxo de consulta CEST', () => {
    test('deve retornar NCMs para consulta por CEST', async () => {
      const mockCestResults = [
        {
          cest: '0100100',
          ncm: '87021000',
          descricao: 'Veículos automóveis para transporte de 10 pessoas ou mais'
        }
      ];

      const mockPrepare = mockDb.prepare();
      mockPrepare.all.mockReturnValue(mockCestResults);

      const response = await request(app)
        .get('/cest/search/0100100')
        .expect(200);

      expect(response.body).toEqual(mockCestResults);
    });

    test('deve retornar CESTs para consulta por NCM', async () => {
      const mockCestData = [
        {
          cest: '1400400',
          ncm: '210690',
          descricao: 'Preparações alimentícias diversas'
        }
      ];

      const mockPrepare = mockDb.prepare();
      mockPrepare.all.mockReturnValue(mockCestData);

      const response = await request(app)
        .get('/cest/21069090')
        .expect(200);

      expect(response.body).toEqual(mockCestData);
    });
  });

  describe('Fluxo de validação GTIN', () => {
    test('deve validar obrigatoriedade GTIN para NCM específico', async () => {
      const mockGtinObrigatorio = {
        ncm: '21069090',
        descricao: 'Preparações alimentícias diversas',
        grupo: '2106'
      };

      const mockPrepare = mockDb.prepare();
      mockPrepare.get.mockReturnValue(mockGtinObrigatorio);

      const response = await request(app)
        .get('/ncm/21069090/gtin-obrigatorio')
        .expect(200);

      expect(response.body).toEqual({
        ncm: '21069090',
        gtinObrigatorio: true,
        dataVigencia: '2025-10-01',
        motivo: 'NCM obrigatório para GTIN a partir de 01/10/2025',
        grupo: '2106',
        descricao: 'Preparações alimentícias diversas'
      });
    });

    test('deve validar não obrigatoriedade GTIN para NCM específico', async () => {
      const mockPrepare = mockDb.prepare();
      mockPrepare.get.mockReturnValue(null);

      const response = await request(app)
        .get('/ncm/85171200/gtin-obrigatorio')
        .expect(200);

      expect(response.body).toEqual({
        ncm: '85171200',
        gtinObrigatorio: false,
        dataVigencia: null,
        motivo: 'NCM não obrigatório para GTIN',
        grupo: null,
        descricao: null
      });
    });
  });

  describe('Tratamento de erros de integração', () => {
    test('deve retornar erro 404 quando NCM não encontrado', async () => {
      const mockPrepare = mockDb.prepare();
      mockPrepare.get.mockReturnValue(null);

      const response = await request(app)
        .get('/sp/99999999')
        .expect(404);

      expect(response.body).toEqual({
        error: 'NCM não encontrado para a UF especificada.'
      });
    });

    test('deve retornar erro 500 em caso de falha no banco', async () => {
      const mockPrepare = mockDb.prepare();
      mockPrepare.get.mockImplementation(() => {
        throw new Error('Erro no banco de dados');
      });

      const response = await request(app)
        .get('/sp/21069090')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Erro interno no servidor.');
    });
  });

  describe('Validação de parâmetros', () => {
    test('deve aceitar UF em minúsculas e converter para maiúsculas', async () => {
      const mockIbptData = {
        ncm: '21069090',
        uf: 'SP',
        descricao: 'Preparações alimentícias diversas'
      };

      const ibptStmt = mockDb.prepare();
      const cestStmt = mockDb.prepare();
      const gtinStmt = mockDb.prepare();

      ibptStmt.get.mockReturnValue(mockIbptData);
      cestStmt.all.mockReturnValue([]);
      gtinStmt.get.mockReturnValue(null);

      const response = await request(app)
        .get('/sp/21069090')
        .expect(200);

      expect(response.body.UF).toBe('SP');
    });

    test('deve aceitar NCM com pontos e remover', async () => {
      const mockIbptData = {
        ncm: '21069090',
        uf: 'SP',
        descricao: 'Preparações alimentícias diversas'
      };

      const ibptStmt = mockDb.prepare();
      const cestStmt = mockDb.prepare();
      const gtinStmt = mockDb.prepare();

      ibptStmt.get.mockReturnValue(mockIbptData);
      cestStmt.all.mockReturnValue([]);
      gtinStmt.get.mockReturnValue(null);

      const response = await request(app)
        .get('/sp/2106.90.90')
        .expect(200);

      expect(response.body.Codigo).toBe('21069090');
    });
  });
});