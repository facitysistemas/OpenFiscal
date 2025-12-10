const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Mock do banco de dados para testes
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

describe('GTIN Validation Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /ncm/:ncm/gtin-obrigatorio', () => {
    test('deve retornar obrigatoriedade GTIN para NCM válido', async () => {
      // Mock da consulta GTIN obrigatório
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

    test('deve retornar não obrigatório para NCM sem GTIN', async () => {
      // Mock da consulta GTIN obrigatório retornando null
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

    test('deve retornar erro para NCM inválido', async () => {
      const response = await request(app)
        .get('/ncm/1234567/gtin-obrigatorio')
        .expect(400);

      expect(response.body).toEqual({
        error: 'NCM inválido. Deve conter exatamente 8 dígitos.'
      });
    });

    test('deve aceitar NCM com pontos', async () => {
      const mockGtinObrigatorio = {
        ncm: '21069090',
        descricao: 'Preparações alimentícias diversas',
        grupo: '2106'
      };
      
      const mockPrepare = mockDb.prepare();
      mockPrepare.get.mockReturnValue(mockGtinObrigatorio);

      const response = await request(app)
        .get('/ncm/2106.90.90/gtin-obrigatorio')
        .expect(200);

      expect(response.body.ncm).toBe('21069090');
    });
  });

  describe('GET /:uf/:ncm (endpoint principal)', () => {
    test('deve incluir informação GTIN na resposta', async () => {
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

      expect(response.body).toHaveProperty('GTINObrigatorio', true);
      expect(response.body).toHaveProperty('DataVigenciaGTIN', '2025-10-01');
      expect(response.body).toHaveProperty('CESTs', mockCestData);
    });

    test('deve retornar GTIN não obrigatório quando NCM não exige', async () => {
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

      expect(response.body).toHaveProperty('GTINObrigatorio', false);
      expect(response.body).toHaveProperty('DataVigenciaGTIN', null);
    });
  });

  describe('Validação de NCM', () => {
    test('deve aceitar NCM com 8 dígitos', async () => {
      const mockPrepare = mockDb.prepare();
      mockPrepare.get.mockReturnValue(null);

      const response = await request(app)
        .get('/ncm/21069090/gtin-obrigatorio')
        .expect(200);

      expect(response.body.ncm).toBe('21069090');
    });

    test('deve rejeitar NCM com menos de 8 dígitos', async () => {
      const response = await request(app)
        .get('/ncm/2106909/gtin-obrigatorio')
        .expect(400);

      expect(response.body.error).toContain('NCM inválido');
    });

    test('deve rejeitar NCM com mais de 8 dígitos', async () => {
      const response = await request(app)
        .get('/ncm/210690901/gtin-obrigatorio')
        .expect(400);

      expect(response.body.error).toContain('NCM inválido');
    });

    test('deve rejeitar NCM com caracteres não numéricos', async () => {
      const response = await request(app)
        .get('/ncm/2106909a/gtin-obrigatorio')
        .expect(400);

      expect(response.body.error).toContain('NCM inválido');
    });
  });

  describe('Tratamento de erros', () => {
    test('deve retornar erro 500 em caso de falha no banco', async () => {
      // Mock de erro no banco
      const mockPrepare = mockDb.prepare();
      mockPrepare.get.mockImplementation(() => {
        throw new Error('Erro no banco de dados');
      });

      const response = await request(app)
        .get('/ncm/21069090/gtin-obrigatorio')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Erro interno no servidor.');
    });
  });
});