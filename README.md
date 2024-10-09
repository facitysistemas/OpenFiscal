# OpenFiscal

OpenFiscal é um projeto open source que visa converter tabelas tributárias NCM em JSON e disponibilizar uma API REST para facilitar o acesso a dados fiscais. Com foco na transparência e acessibilidade, o OpenFiscal permite a consulta a tributos federais, estaduais e municipais de forma simples e eficiente.

## Funcionalidades

- **Conversão Automática**: Baixa tabelas tributárias em CSV de fontes públicas e as converte automaticamente em JSON padronizado.
- **API REST**: Disponibiliza os dados convertidos por meio de endpoints para fácil integração com outras aplicações.
- **Atualizações Frequentes**: Monitora as tabelas tributárias e mantém os dados atualizados para garantir a precisão das consultas.
- **Transparência e Simplicidade**: Promove o acesso aberto aos dados fiscais, permitindo que desenvolvedores e empresas tenham informações tributárias claras.

## Fonte dos Dados

As tabelas tributárias utilizadas pelo OpenFiscal são fornecidas pelo [IBPT (Instituto Brasileiro de Planejamento e Tributação)](https://www.ibpt.com.br) e disponibilizadas pelo [SVN do ACBr](http://svn.code.sf.net/p/acbr/code/trunk2/Exemplos/ACBrTCP/ACBrIBPTax/tabela/).

## Requisitos

- **Node.js** (v14 ou superior)
- **npm** (v6 ou superior)

## Instalação

1. Clone o repositório:
   ```sh
   git clone https://github.com/seu-usuario/openfiscal.git
   cd openfiscal
   ```

2. Instale as dependências:
   ```sh
   npm install
   ```

3. Inicie os serviços com PM2:
   ```sh
   pm2 start app.js --name openfiscal-api && pm2 start generateJson.js --name openfiscal-json-generator && pm2 save && pm2 startup
   ```

## Uso

Após iniciar os serviços, a API estará disponível na porta 3000 (ou a porta configurada na variável de ambiente `PORT`).

Para consultar informações sobre um código NCM em um estado específico, use o endpoint:

```http
GET /:uf/:ncm
```

- **`uf`**: Unidade Federativa (ex.: `SP`, `RJ`)
- **`ncm`**: Código NCM do produto

### Exemplo de Requisição

```sh
curl http://localhost:3000/SP/12345678
```

## Como Contribuir

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou enviar pull requests com melhorias, correções ou novas funcionalidades.

1. Faça um fork do projeto.
2. Crie uma branch para a sua feature (`git checkout -b minha-feature`).
3. Faça o commit das suas alterações (`git commit -m 'Adicionando nova feature'`).
4. Envie a sua branch (`git push origin minha-feature`).
5. Abra um Pull Request.

## Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para mais detalhes.
