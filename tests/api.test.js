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

describe('API Endpoints Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /search/:descricao', () => {
    test('deve retornar NCMs para descrição válida', async () => {
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

    test('deve retornar erro para descrição muito curta', async () => {
      const response = await request(app)
        .get('/search/ab')
        .expect(400);

      expect(response.body).toEqual({
        error: 'A descrição da busca deve ter pelo menos 3 caracteres.'
      });
    });

    test('deve retornar 404 quando não encontrar resultados', async () => {
      const mockPrepare = mockDb.prepare();
      mockPrepare.all.mockReturnValue([]);

      const response = await request(app)
        .get('/search/produtoinexistente')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Nenhum NCM encontrado para a descrição fornecida.'
      });
    });
  });

  describe('GET /cest/search/:cest', () => {
    test('deve retornar NCMs para CEST válido', async () => {
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

    test('deve retornar 404 quando não encontrar CEST', async () => {
      const mockPrepare = mockDb.prepare();
      mockPrepare.all.mockReturnValue([]);

      const response = await request(app)
        .get('/cest/search/9999999')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Nenhum resultado encontrado para o CEST especificado.'
      });
    });

    test('deve aceitar CEST com pontos', async () => {
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
        .get('/cest/search/010.01.00')
        .expect(200);

      expect(response.body).toEqual(mockCestResults);
    });
  });

  describe('GET /ncm/filter/:prefixo', () => {
    test('deve retornar NCMs para prefixo válido', async () => {
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

    test('deve retornar erro para prefixo inválido', async () => {
      const response = await request(app)
        .get('/ncm/filter/abc')
        .expect(400);

      expect(response.body).toEqual({
        error: 'O prefixo do NCM deve conter apenas números.'
      });
    });

    test('deve retornar 404 quando não encontrar prefixo', async () => {
      const mockPrepare = mockDb.prepare();
      mockPrepare.all.mockReturnValue([]);

      const response = await request(app)
        .get('/ncm/filter/9999')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Nenhum NCM encontrado para o prefixo fornecido.'
      });
    });
  });

  describe('GET /ibpt/:uf/:ncm', () => {
    test('deve retornar dados IBPT para UF e NCM válidos', async () => {
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

      const mockPrepare = mockDb.prepare();
      mockPrepare.get.mockReturnValue(mockIbptData);

      const response = await request(app)
        .get('/ibpt/sp/21069090')
        .expect(200);

      expect(response.body).toEqual(mockIbptData);
    });

    test('deve retornar 404 quando não encontrar dados IBPT', async () => {
      const mockPrepare = mockDb.prepare();
      mockPrepare.get.mockReturnValue(null);

      const response = await request(app)
        .get('/ibpt/sp/99999999')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Nenhum dado do IBPT encontrado para a UF e NCM especificados.'
      });
    });

    test('deve aceitar UF em minúsculas', async () => {
      const mockIbptData = {
        ncm: '21069090',
        uf: 'SP',
        descricao: 'Preparações alimentícias diversas'
      };

      const mockPrepare = mockDb.prepare();
      mockPrepare.get.mockReturnValue(mockIbptData);

      const response = await request(app)
        .get('/ibpt/sp/21069090')
        .expect(200);

      expect(response.body.uf).toBe('SP');
    });
  });

  describe('GET /cest/:ncm', () => {
    test('deve retornar dados CEST para NCM válido', async () => {
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

    test('deve retornar 404 quando não encontrar CEST', async () => {
      const mockPrepare = mockDb.prepare();
      mockPrepare.all.mockReturnValue([]);

      const response = await request(app)
        .get('/cest/99999999')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Nenhum CEST encontrado para o NCM especificado.'
      });
    });

    test('deve aceitar NCM com pontos', async () => {
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
        .get('/cest/2106.90.90')
        .expect(200);

      expect(response.body).toEqual(mockCestData);
    });
  });

  describe('Tratamento de erros', () => {
    test('deve retornar erro 500 em caso de falha no banco', async () => {
      const mockPrepare = mockDb.prepare();
      mockPrepare.get.mockImplementation(() => {
        throw new Error('Erro no banco de dados');
      });

      const response = await request(app)
        .get('/ibpt/sp/21069090')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Erro interno no servidor.');
    });
  });
});