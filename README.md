# Boletim do IPM · Rio Grande do Sul

Painel estático (HTML + JS puro, sem build, sem servidor) com a evolução do IPM
dos 497 municípios gaúchos, 2003–2026.

## Arquivos

- `index.html`, `styles.css`, `app.js` — o site em si (gerados aqui).
- `series.json`, `mapa.geojson` — os dados. **Gere esses dois no Colab** com o
  script `gerar_dados_painel.py` (rode como última célula, depois que
  `df_final_completo` e `gdf_mapa_limpo` já estiverem prontos).

## Como publicar no GitHub Pages

1. Baixe os 5 arquivos (`index.html`, `styles.css`, `app.js`, `series.json`,
   `mapa.geojson`) e coloque todos na raiz do mesmo repositório.
2. No GitHub: Settings → Pages → Source → escolha a branch (geralmente `main`)
   e a pasta `/root`. Salve.
3. Em alguns minutos o painel fica disponível em
   `https://<seu-usuario>.github.io/<nome-do-repo>/`.

## Testar localmente antes de subir

Navegadores bloqueiam `fetch()` de arquivos locais abertos direto
(`file://`). Para testar antes de publicar, rode um servidor simples na
pasta do projeto:

```bash
python3 -m http.server 8000
```

e abra `http://localhost:8000` no navegador.

## Se os dados mudarem no futuro (ex: IPM Definitivo de 2027)

Basta rodar de novo o pipeline de scraping + parsing no Colab, gerar um novo
`series.json` (o `mapa.geojson` não muda, a malha municipal é a mesma) e
substituir o arquivo no repositório. O site lê os dados dinamicamente, não
precisa mexer no HTML/JS.
