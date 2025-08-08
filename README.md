# OpenFiscal API

![Node.js](https://img.shields.io/badge/Node.js-20.x_LTS-green)
![Express.js](https://img.shields.io/badge/Express.js-4.x-blue)
![Database](https://img.shields.io/badge/Database-SQLite-orange)
![License](https://img.shields.io/badge/License-ISC-yellow)

API otimizada para consulta de dados fiscais brasileiros (NCM, CEST, IBPT), com baixo uso de memória, atualizações automáticas e lógica de busca inteligente.

---

## ⚠️ Aviso Legal e de Responsabilidade

**O objetivo deste repositório é estritamente educacional e colaborativo, visando facilitar o acesso e a consolidação de informações fiscais públicas.**

As informações contidas neste projeto são coletadas de fontes oficiais e públicas e fontes secundarias como o projeto ACBR, mas são fornecidas "como estão", sem garantias de qualquer tipo, expressas ou implícitas, sobre sua precisão, completude ou atualidade. A legislação tributária é complexa e está em constante mudança.

**A responsabilidade pelo uso das informações obtidas através desta API é inteiramente sua.**

**Observação Importante:** Antes de utilizar os dados desta API em qualquer ambiente de produção ou para fins fiscais oficiais, é **obrigatório** que você consulte seu contador ou um profissional de contabilidade qualificado. Apenas um profissional pode validar e aprovar o uso dessas informações de acordo com as particularidades da sua empresa e a legislação vigente.

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

O grande diferencial deste projeto é a sua arquitetura leve e performática, que utiliza um banco de dados local **SQLite** com um motor de busca de texto completo (FTS5) integrado, garantindo consultas complexas com baixa pegada de memória.

### ✨ Principais Funcionalidades

* **Consulta Consolidada**: Retorna um objeto de resposta rico com dados do IBPT, totais de tributos calculados e a lista de CESTs correspondentes.
* **Busca Semântica por Descrição**: Um endpoint poderoso (`/search/:descricao`) que encontra os NCMs mais prováveis a partir de uma descrição de produto.
* **Busca por CEST**: Um endpoint (`/cest/search/:cest`) para encontrar todos os NCMs associados a um código CEST específico.
* **Atualização Automática**: Um script agendado (`cron`) busca e atualiza **semanalmente** (todo domingo às 2h da manhã) os dados de fontes oficiais.
* **Lógica de Busca Inteligente**: A consulta de CEST por NCM encontra sempre a correspondência mais específica (prefixo de NCM mais longo), evitando ambiguidades.
* **Performance Otimizada**: Utiliza consultas preparadas (prepared statements) e índices otimizados para máxima velocidade nas respostas da API.

### 💻 Tecnologias Utilizadas

* **Back-end**: Node.js, Express.js
* **Banco de Dados**: SQLite (com a biblioteca `better-sqlite3` e extensão FTS5)
* **Coleta de Dados**: Axios (requisições HTTP), Cheerio (web scraping)
* **Processamento de Dados**: csvtojson, json2csv
* **Agendamento de Tarefas**: node-cron

## 🚀 Começando

Siga os passos abaixo para ter uma cópia do projeto rodando localmente.

### ✅ Pré-requisitos

* Node.js (versão 20.x LTS ou superior)
* npm (geralmente instalado com o Node.js)

### 📦 Instalação

1.  Clone o repositório:
    ```bash
    git clone [https://github.com/facitysistemas/OpenFiscal.git](https://github.com/facitysistemas/OpenFiscal.git)
    ```
2.  Navegue até o diretório do projeto:
    ```bash
    cd OpenFiscal
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

#### 1. Endpoints de Busca

* **Busca de NCM por Descrição (Semântica)**:
    * **Endpoint**: `GET /search/:descricao`
    * **Exemplo**: `GET http://localhost:7389/search/refrigerante`
    * **Resposta**:
        ```json
        [
            {
                "ncm": "22021000",
                "descricao": "Águas, incluindo as águas minerais e as águas gaseificadas, adicionadas de açúcar..."
            },
            {
                "ncm": "21069010",
                "descricao": "Preparações do tipo utilizado para elaboração de bebidas"
            }
        ]
        ```

* **Busca Completa por Código CEST**:
    * **Endpoint**: `GET /cest/search/:cest`
    * **Exemplo**: `GET http://localhost:7389/cest/search/0100100`
    * **Resposta**:
        ```json
        [
            {
                "cest": "0100100",
                "ncm": "87021000",
                "descricao": "Veículos automóveis para transporte de 10 pessoas ou mais, incluindo o motorista..."
            }
        ]
        ```

---

#### 2. Consulta Principal e Consolidada

Este é o endpoint principal. Ele retorna um objeto completo contendo todos os dados fiscais do IBPT, totais de tributos calculados e a lista de CESTs aplicáveis.

* **Endpoint**: `GET /:uf/:ncm`
* **Exemplo**: `GET http://localhost:7389/sp/39269090`
* **Resposta de Sucesso (200 OK)**:
    ```json
    {
        "Codigo": "39269090",
        "UF": "SP",
        "EX": "001",
        "Descricao": "Outras obras de plásticos",
        "Nacional": 38.41,
        "Estadual": 12.00,
        "Importado": 38.41,
        "Municipal": 0.00,
        "TotalTributosNacionais": 50.41,
        "TotalTributosImportados": 50.41,
        "Tipo": "NBS",
        "VigenciaInicio": "2023-01-01",
        "VigenciaFim": "2023-12-31",
        "Chave": "AAAA-BBBB",
        "Versao": "24.2.A",
        "Fonte": "IBPT",
        "CESTs": [
            {
                "cest": "1400400",
                "ncm": "392690",
                "descricao": "Outras obras de plástico, para transportes"
            }
        ]
    }
    ```

---

#### 3. Endpoints de Consulta Direta (Dados Brutos)

* **Consulta de IBPT**:
    * **Endpoint**: `GET /ibpt/:uf/:ncm`
    * **Exemplo**: `GET http://localhost:7389/ibpt/sp/39269090`

* **Consulta de CEST por NCM**:
    * **Endpoint**: `GET /cest/:ncm`
    * **Exemplo**: `GET http://localhost:7389/cest/39269090`

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
    ```
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
