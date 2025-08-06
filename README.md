# OpenFiscal API

![Node.js](https://img.shields.io/badge/Node.js-18.x-green)
![Express.js](https://img.shields.io/badge/Express.js-4.x-blue)
![Database](https://img.shields.io/badge/Database-SQLite-orange)
![License](https://img.shields.io/badge/License-ISC-yellow)

API otimizada para consulta de dados fiscais brasileiros (IBPT e CEST), com baixo uso de memória, atualizações automáticas e lógica de busca inteligente.

---

## 📋 Tabela de Conteúdos

1.  [Sobre o Projeto](#-sobre-o-projeto)
    * [Principais Funcionalidades](#-principais-funcionalidades)
    * [Tecnologias Utilizadas](#-tecnologias-utilizadas)
2.  [🚀 Começando](#-começando)
    * [Pré-requisitos](#-pré-requisitos)
    * [Instalação](#-instalação)
3.  [⚙️ Uso](#️-uso)
    * [Scripts Disponíveis](#scripts-disponíveis)
    * [Endpoints da API](#endpoints-da-api)
4.  [🚀 Implantação com PM2 (Produção)](#-implantação-com-pm2-produção)
    * [Gerenciando a Atualização Automática](#gerenciando-a-atualização-automática)
5.  [🏗️ Estrutura do Projeto](#️-estrutura-do-projeto)
6.  [📄 Licença](#-licença)

## 📌 Sobre o Projeto

A **OpenFiscal API** é um serviço de back-end construído em Node.js que fornece uma interface RESTful para consultar dados fiscais brasileiros de forma rápida e eficiente. O sistema foi projetado para resolver a necessidade de acessar informações de **IBPT** (alíquotas de impostos) e **CEST** (Código Especificador da Substituição Tributária) relacionadas a um **NCM** (Nomenclatura Comum do Mercosul).

O grande diferencial deste projeto é a sua arquitetura leve e performática, que utiliza um banco de dados local **SQLite** para evitar o alto consumo de memória. Além disso, ele possui um sistema de atualização automatizada que busca os dados mais recentes de fontes oficiais, garantindo a confiabilidade da informação.

### ✨ Principais Funcionalidades

* **Consulta Consolidada**: Retorna dados de IBPT e CEST em uma única requisição.
* **Atualização Automática**: Um script agendado (`cron`) busca e atualiza diariamente os dados de fontes oficiais (tabelas do IBPT/ACBr e convênio do CONFAZ).
* **Busca Inteligente**: A lógica de busca por CEST encontra sempre a correspondência mais específica (prefixo de NCM mais longo), evitando ambiguidades.
* **Baixo Consumo de Recursos**: O uso de SQLite (`better-sqlite3`) garante uma operação com baixa pegada de memória.
* **Performance Otimizada**: Utiliza consultas preparadas (prepared statements) para máxima velocidade nas respostas da API.
* **Exportação de Dados**: Gera arquivos `JSON` e `CSV` com a base de dados completa e consolidada.

### 💻 Tecnologias Utilizadas

* **Back-end**: Node.js, Express.js
* **Banco de Dados**: SQLite (com a biblioteca `better-sqlite3`)
* **Coleta de Dados**: Axios (requisições HTTP), Cheerio (web scraping)
* **Processamento de Dados**: csvtojson, json2csv
* **Agendamento de Tarefas**: node-cron

## 🚀 Começando

Siga os passos abaixo para ter uma cópia do projeto rodando localmente.

### ✅ Pré-requisitos

* Node.js (versão 16.x ou superior)
* npm (geralmente instalado com o Node.js)

### 📦 Instalação

1.  Clone o repositório:
    ```bash
    git clone [https://github.com/seu-usuario/seu-repositorio.git](https://github.com/seu-usuario/seu-repositorio.git)
    ```
2.  Navegue até o diretório do projeto:
    ```bash
    cd openfiscal-api
    ```
3.  Instale as dependências do NPM:
    ```bash
    npm install
    ```
4.  **Gerar o Banco de Dados (Passo Obrigatório na Primeira Vez)**:
    Este comando irá baixar todos os dados, processá-los e criar o arquivo de banco de dados `openfiscal.db`. **Este processo pode demorar vários minutos.**
    ```bash
    npm run update-db
    ```
5.  Inicie o servidor da API:
    ```bash
    npm start
    ```
    O servidor estará rodando em `http://localhost:7389`.

## ⚙️ Uso

### Scripts Disponíveis

* `npm start`: Inicia o servidor da API (`app.js`).
* `npm run update-db`: Executa o script `generateDatabase.js` para criar ou atualizar o banco de dados a partir das fontes oficiais. Use este comando para forçar uma atualização manual.

### Endpoints da API

A URL base da API é `http://localhost:7389`.

---

#### 1. Consulta Consolidada (IBPT + CEST)

Retorna os dados do IBPT e todos os CESTs correspondentes (da regra mais específica encontrada).

* **Endpoint**: `GET /ncm/:uf/:ncm`
* **Parâmetros**:
    * `:uf`: Sigla da Unidade Federativa (ex: `SP`, `PR`).
    * `:ncm`: Código NCM (com ou sem pontos).
* **Exemplo de Requisição**:
    `GET http://localhost:7389/ncm/sp/39269090`
* **Resposta de Sucesso (200 OK)**:
    ```json
    {
        "ncm": "39269090",
        "uf": "SP",
        "descricao": "Outras obras de plásticos",
        "aliqNacional": 38.41,
        "aliqEstadual": 12.00,
        "aliqMunicipal": 0.00,
        "aliqImportado": 38.41,
        "vigenciaInicio": "2023-01-01",
        "vigenciaFim": "2023-12-31",
        "cests": [
            {
                "cest": "2803300",
                "ncm": "39241000",
                "descricao": "Artefatos de higiene ou de toucador"
            },
            {
                "cest": "1400400",
                "ncm": "392690",
                "descricao": "Outras obras de plástico, para transportes"
            }
        ]
    }
    ```
* **Resposta de Erro (404 Not Found)**:
    ```json
    {
        "error": "Nenhum dado do IBPT encontrado para a UF e NCM especificados."
    }
    ```

---

#### 2. Consulta Apenas de IBPT

* **Endpoint**: `GET /ibpt/:uf/:ncm`
* **Exemplo de Requisição**:
    `GET http://localhost:7389/ibpt/sp/39269090`

---

#### 3. Consulta Apenas de CEST

* **Endpoint**: `GET /cest/:ncm`
* **Exemplo de Requisição**:
    `GET http://localhost:7389/cest/39269090`

---

## 🚀 Implantação com PM2 (Produção)

Para rodar esta API em um ambiente de produção, é altamente recomendado usar um gerenciador de processos como o **PM2**. Ele manterá a API online 24/7, reiniciando-a automaticamente em caso de falhas e facilitando o gerenciamento de logs.

1.  **Instale o PM2 globalmente**:
    ```bash
    npm install pm2 -g
    ```
2.  **Inicie a API com o PM2**:
    Navegue até a pasta do projeto e execute:
    ```bash
    pm2 start app.js --name "openfiscal-api"
    ```
    * `--name "openfiscal-api"`: Define um nome fácil de gerenciar para o processo.

3.  **Monitore a API**:
    Para ver o status de todos os processos gerenciados pelo PM2:
    ```bash
    pm2 list
    ```
    Para um monitoramento em tempo real no terminal:
    ```bash
    pm2 monit
    ```
4.  **Gerencie os Logs**:
    Para visualizar os logs da API em tempo real:
    ```bash
    pm2 logs openfiscal-api
    ```

5.  **Comandos Úteis de Gerenciamento**:
    ```bash
    pm2 stop openfiscal-api      # Parar a API
    pm2 restart openfiscal-api   # Reiniciar a API
    pm2 delete openfiscal-api    # Remover a API da lista do PM2
    ```
6.  **Salvar a lista de processos**:
    Para garantir que o PM2 reinicie suas aplicações após uma reinicialização do servidor, execute os seguintes comandos:
    ```bash
    pm2 save          # Salva a lista de processos atual
    pm2 startup       # Gera um script de inicialização para o seu sistema operacional
    ```
    O comando `pm2 startup` irá gerar e exibir um comando que você deve copiar e colar no seu terminal para finalizar a configuração.

### Gerenciando a Atualização Automática

O script `generateDatabase.js` contém uma tarefa agendada que precisa estar sempre em execução para manter o banco de dados atualizado. É uma boa prática gerenciá-lo com o PM2 também.

1.  **Inicie o script de atualização com o PM2**:
    ```bash
    pm2 start generateDatabase.js --name "openfiscal-updater"
    ```
2.  **Verifique o status de ambos os processos**:
    Após iniciar os dois serviços, o comando `pm2 list` deverá mostrar algo assim:
    ```bash
    ┌────┬──────────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
    │ id │ name                 │ mode     │ ↺    │ status    │ cpu      │ memory   │
    ├────┼──────────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
    │ 0  │ openfiscal-api       │ fork     │ 0    │ online    │ 0%       │ 50mb     │
    │ 1  │ openfiscal-updater   │ fork     │ 0    │ online    │ 0%       │ 35mb     │
    └────┴──────────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
    ```
3.  **Gerenciamento**:
    Todos os comandos do PM2 (`logs`, `stop`, `restart`) também funcionam para o processo `openfiscal-updater`. Para salvar ambos os processos para reinicialização do servidor, basta executar `pm2 save` após ter iniciado os dois.

## 🏗️ Estrutura do Projeto
* `/`
    * `node_modules/`: Dependências do projeto
    * `.gitignore`: Arquivos ignorados pelo Git
    * `app.js`: O servidor da API (Express.js)
    * `generateDatabase.js`: Script para criar e atualizar o banco de dados
    * `package.json`: Manifesto do projeto e dependências
    * `package-lock.json`: Lock das versões das dependências
    * `README.md`: Este arquivo

**Arquivos Gerados (após `npm run update-db`):**

* `openfiscal.db`: Arquivo do banco de dados SQLite.
* `cest_metadata.json`: Arquivo de controle para a atualização do CEST.
* `openfiscal_completo.json`: Exportação completa dos dados em formato JSON.
* `openfiscal_completo.csv`: Exportação completa dos dados em formato CSV.

## 📄 Licença

Este projeto está sob a licença ISC. Veja o arquivo `package.json` para mais detalhes.