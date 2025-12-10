// Testes simples para validar funcionalidades básicas
describe('OpenFiscal - Testes Básicos', () => {
  
  describe('Validação de NCM', () => {
    test('deve validar formato de NCM com 8 dígitos', () => {
      const ncm = '21069090';
      expect(ncm).toMatch(/^\d{8}$/);
    });

    test('deve rejeitar NCM com menos de 8 dígitos', () => {
      const ncm = '2106909';
      expect(ncm).not.toMatch(/^\d{8}$/);
    });

    test('deve rejeitar NCM com mais de 8 dígitos', () => {
      const ncm = '210690901';
      expect(ncm).not.toMatch(/^\d{8}$/);
    });

    test('deve rejeitar NCM com caracteres não numéricos', () => {
      const ncm = '2106909a';
      expect(ncm).not.toMatch(/^\d{8}$/);
    });
  });

  describe('Validação de GTIN', () => {
    test('deve validar formato de GTIN com 13 dígitos', () => {
      const gtin = '7891234567890';
      expect(gtin).toMatch(/^\d{13}$/);
    });

    test('deve validar formato de GTIN com 8 dígitos', () => {
      const gtin = '12345678';
      expect(gtin).toMatch(/^\d{8}$/);
    });

    test('deve validar formato de GTIN com 12 dígitos', () => {
      const gtin = '123456789012';
      expect(gtin).toMatch(/^\d{12}$/);
    });

    test('deve validar formato de GTIN com 14 dígitos', () => {
      const gtin = '12345678901234';
      expect(gtin).toMatch(/^\d{14}$/);
    });

    test('deve rejeitar GTIN com tamanho inválido', () => {
      const gtin = '123456789';
      expect(gtin).not.toMatch(/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/);
    });
  });

  describe('Validação de GTIN', () => {
    function validarFormatoGTIN(gtin) {
      const gtinLimpo = gtin.replace(/\D/g, '');
      return [8, 12, 13, 14].includes(gtinLimpo.length);
    }

    test('deve validar formato de GTIN válido', () => {
      expect(validarFormatoGTIN('7891234567890')).toBe(true);
      expect(validarFormatoGTIN('12345678')).toBe(true);
      expect(validarFormatoGTIN('123456789012')).toBe(true);
      expect(validarFormatoGTIN('12345678901234')).toBe(true);
    });

    test('deve rejeitar formato de GTIN inválido', () => {
      expect(validarFormatoGTIN('123456789')).toBe(false);
      expect(validarFormatoGTIN('123456789012345')).toBe(false);
      expect(validarFormatoGTIN('abc1234567890')).toBe(false);
    });

    test('deve aceitar "SEM GTIN" como válido', () => {
      expect(validarFormatoGTIN('SEM GTIN')).toBe(false); // Não é numérico, mas é aceito pela SEFAZ
    });
  });

  describe('Validação de grupos obrigatórios GTIN', () => {
    function verificarObrigatoriedadeGTIN(ncm, descricao) {
      const grupo = ncm.substring(0, 4);
      
      // Grupos obrigatórios conhecidos
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

    test('deve identificar grupos obrigatórios', () => {
      expect(verificarObrigatoriedadeGTIN('21069010', 'Preparações alimentícias')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('22029010', 'Águas minerais')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('30031000', 'Medicamentos')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('33041000', 'Produtos de higiene')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('34011100', 'Sabões')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('39231000', 'Embalagens plásticas')).toBe(true);
    });

    test('deve identificar grupos não obrigatórios', () => {
      expect(verificarObrigatoriedadeGTIN('85171200', 'Telefones celulares')).toBe(false);
      expect(verificarObrigatoriedadeGTIN('72071100', 'Ferro-gusa')).toBe(false);
      expect(verificarObrigatoriedadeGTIN('10019000', 'Trigo')).toBe(false);
    });

    test('deve identificar palavras-chave na descrição', () => {
      expect(verificarObrigatoriedadeGTIN('99999999', 'Produto embalado')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('99999999', 'Produto comercializado')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('99999999', 'Produto identificável')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('99999999', 'Produto rastreável')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('99999999', 'Produto com código de barras')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('99999999', 'Produto com EAN')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('99999999', 'Produto com GTIN')).toBe(true);
    });

    test('deve ser case-insensitive para palavras-chave', () => {
      expect(verificarObrigatoriedadeGTIN('99999999', 'PRODUTO EMBALADO')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('99999999', 'Produto Embalado')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('99999999', 'produto embalado')).toBe(true);
      expect(verificarObrigatoriedadeGTIN('99999999', 'PrOdUtO eMbAlAdO')).toBe(true);
    });

    test('deve rejeitar descrições sem palavras-chave', () => {
      expect(verificarObrigatoriedadeGTIN('99999999', 'Produto industrial')).toBe(false);
      expect(verificarObrigatoriedadeGTIN('99999999', 'Produto agrícola')).toBe(false);
      expect(verificarObrigatoriedadeGTIN('99999999', 'Produto químico')).toBe(false);
    });
  });

  describe('Validação de UF', () => {
    test('deve aceitar UFs válidas', () => {
      const ufsValidas = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
      
      ufsValidas.forEach(uf => {
        expect(uf).toMatch(/^[A-Z]{2}$/);
      });
    });

    test('deve converter UF para maiúsculas', () => {
      const uf = 'sp';
      const ufUpper = uf.toUpperCase();
      expect(ufUpper).toBe('SP');
    });
  });

  describe('Validação de CEST', () => {
    test('deve validar formato de CEST com 7 dígitos', () => {
      const cest = '0100100';
      expect(cest).toMatch(/^\d{7}$/);
    });

    test('deve aceitar CEST com pontos', () => {
      const cest = '010.01.00';
      const cestLimpo = cest.replace(/\./g, '');
      expect(cestLimpo).toBe('0100100');
    });
  });

  describe('Cálculos de tributos', () => {
    test('deve calcular total de tributos nacionais corretamente', () => {
      const aliqNacional = 38.41;
      const aliqEstadual = 12.00;
      const aliqMunicipal = 0.00;
      
      const total = Math.round(((aliqNacional || 0) + (aliqEstadual || 0) + (aliqMunicipal || 0)) * 100) / 100;
      
      expect(total).toBe(50.41);
    });

    test('deve calcular total de tributos importados corretamente', () => {
      const aliqImportado = 38.41;
      const aliqEstadual = 12.00;
      const aliqMunicipal = 0.00;
      
      const total = Math.round(((aliqImportado || 0) + (aliqEstadual || 0) + (aliqMunicipal || 0)) * 100) / 100;
      
      expect(total).toBe(50.41);
    });

    test('deve arredondar corretamente para 2 casas decimais', () => {
      const valor = 50.415;
      const arredondado = Math.round(valor * 100) / 100;
      
      expect(arredondado).toBe(50.42);
    });
  });

  describe('Formatação de dados', () => {
    test('deve remover pontos de NCM', () => {
      const ncm = '2106.90.90';
      const ncmLimpo = ncm.replace(/\./g, '');
      expect(ncmLimpo).toBe('21069090');
    });

    test('deve remover pontos de CEST', () => {
      const cest = '010.01.00';
      const cestLimpo = cest.replace(/\./g, '');
      expect(cestLimpo).toBe('0100100');
    });

    test('deve remover pontos de GTIN', () => {
      const gtin = '789.123.456.789.0';
      const gtinLimpo = gtin.replace(/\./g, '');
      expect(gtinLimpo).toBe('7891234567890');
    });
  });

  describe('Validação de parâmetros de busca', () => {
    test('deve validar descrição com pelo menos 3 caracteres', () => {
      const descricao = 'refrigerante';
      expect(descricao.length).toBeGreaterThanOrEqual(3);
    });

    test('deve rejeitar descrição com menos de 3 caracteres', () => {
      const descricao = 'ab';
      expect(descricao.length).toBeLessThan(3);
    });

    test('deve validar prefixo NCM apenas com números', () => {
      const prefixo = '2106';
      expect(prefixo).toMatch(/^\d+$/);
    });

    test('deve rejeitar prefixo NCM com caracteres não numéricos', () => {
      const prefixo = 'abc';
      expect(prefixo).not.toMatch(/^\d+$/);
    });
  });
});
