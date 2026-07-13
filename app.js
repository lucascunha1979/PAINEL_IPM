/* ============================================================
   Boletim do IPM · Rio Grande do Sul — app.js
   ============================================================ */

const COLORS = {
  line: '#2F5D52',
  mean: '#66695F',
  vline: '#C98E97',
  max: '#B9862F',
  min: '#7A2E3B',
  bar_pos: '#2F5D52',
  bar_neg: '#7A2E3B',
  correl: '#B9862F'
};

const INDICADOR_LABEL = {
  vaf_pct: 'Valor Adicionado Fiscal (% do estado)',
  area_pct: 'Área (% do estado)',
  pop_pct: 'População (% do estado)',
  prop_rural_pct: 'Propriedades rurais (% do estado)',
  produtividade_pct: 'Produtividade primária (% do estado)',
  inverso_vaf_pc_pct: 'Inverso do VAF per capita (% do estado)',
  pit_pct: 'PIT (% do estado)',
  pre_educ_pct: 'Educação — PRE (% do estado)'
};

let SERIES = {};      // { cd_mun: { cod_sefaz, nome, anos: { ano: {...} } } }
let GEO = null;       // geojson
let MUNICIPIOS = [];  // [{cd, nome}]
let ANOS = [];        // [2003..2026]
let state = {
  cd: null,
  anoIni: null,
  anoFim: null,
  indicador: '',
  mapLayer: 'ipm'
};

init();

async function init(){
  const [seriesResp, geoResp] = await Promise.all([
    fetch('series.json'),
    fetch('mapa.geojson')
  ]);
  SERIES = await seriesResp.json();
  GEO = await geoResp.json();

  // normaliza tipos das propriedades do geojson (garante string em CD_MUN)
  GEO.features.forEach(f => { f.properties.CD_MUN = String(f.properties.CD_MUN); });

  MUNICIPIOS = Object.entries(SERIES)
    .map(([cd, v]) => ({ cd, nome: v.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const anosSet = new Set();
  Object.values(SERIES).forEach(m => Object.keys(m.anos).forEach(a => anosSet.add(Number(a))));
  ANOS = Array.from(anosSet).sort((a, b) => a - b);

  populateSelects();
  bindEvents();

  // default: Porto Alegre se existir, senao o primeiro da lista
  const padrao = MUNICIPIOS.find(m => m.nome === 'Porto Alegre') || MUNICIPIOS[0];
  state.cd = padrao.cd;
  state.anoIni = ANOS[0];
  state.anoFim = ANOS[ANOS.length - 1];

  document.getElementById('sel-municipio').value = state.cd;
  document.getElementById('sel-ano-ini').value = state.anoIni;
  document.getElementById('sel-ano-fim').value = state.anoFim;

  renderAll();
  renderMap();
}

function populateSelects(){
  const selMuni = document.getElementById('sel-municipio');
  selMuni.innerHTML = MUNICIPIOS.map(m => `<option value="${m.cd}">${m.nome}</option>`).join('');

  const selIni = document.getElementById('sel-ano-ini');
  const selFim = document.getElementById('sel-ano-fim');
  selIni.innerHTML = ANOS.map(a => `<option value="${a}">${a}</option>`).join('');
  selFim.innerHTML = ANOS.map(a => `<option value="${a}">${a}</option>`).join('');
}

function bindEvents(){
  document.getElementById('sel-municipio').addEventListener('change', e => {
    state.cd = e.target.value; renderAll();
  });
  document.getElementById('sel-ano-ini').addEventListener('change', e => {
    state.anoIni = Number(e.target.value);
    if (state.anoIni > state.anoFim) state.anoFim = state.anoIni;
    document.getElementById('sel-ano-fim').value = state.anoFim;
    renderAll();
  });
  document.getElementById('sel-ano-fim').addEventListener('change', e => {
    state.anoFim = Number(e.target.value);
    if (state.anoFim < state.anoIni) state.anoIni = state.anoFim;
    document.getElementById('sel-ano-ini').value = state.anoIni;
    renderAll();
  });
  document.getElementById('sel-indicador').addEventListener('change', e => {
    state.indicador = e.target.value; renderAll();
  });
  document.getElementById('btn-limpar').addEventListener('click', () => {
    const padrao = MUNICIPIOS.find(m => m.nome === 'Porto Alegre') || MUNICIPIOS[0];
    state = { cd: padrao.cd, anoIni: ANOS[0], anoFim: ANOS[ANOS.length - 1], indicador: '', mapLayer: state.mapLayer };
    document.getElementById('sel-municipio').value = state.cd;
    document.getElementById('sel-ano-ini').value = state.anoIni;
    document.getElementById('sel-ano-fim').value = state.anoFim;
    document.getElementById('sel-indicador').value = '';
    renderAll();
  });
  document.getElementById('btn-pdf').addEventListener('click', exportarPDF);

  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.mapLayer = btn.dataset.layer;
      renderMap();
    });
  });
}

/* ---------------- helpers de dados ---------------- */

function getSerieMunicipio(cd, anoIni, anoFim){
  const m = SERIES[cd];
  const anos = [];
  for (let a = anoIni; a <= anoFim; a++){
    const rec = m.anos[String(a)];
    anos.push({ ano: a, ...(rec || {}) });
  }
  return anos;
}

function getSerieCompletaMunicipio(cd){
  const m = SERIES[cd];
  return Object.keys(m.anos).map(a => ({ ano: Number(a), ...m.anos[a] })).sort((a,b) => a.ano - b.ano);
}

/* ---------------- render geral ---------------- */

function renderAll(){
  const nome = SERIES[state.cd].nome;
  document.getElementById('linha-subtitulo').textContent =
    `${nome} · ${state.anoIni}–${state.anoFim}`;
  document.getElementById('tabela-subtitulo').textContent =
    `${nome} · ${state.anoIni}–${state.anoFim}`;

  renderLineChart();
  renderBarChart();
  renderTable();
}

/* ---------------- grafico de linha ---------------- */

function renderLineChart(){
  const serieFiltrada = getSerieMunicipio(state.cd, state.anoIni, state.anoFim);
  const serieCompleta = getSerieCompletaMunicipio(state.cd);

  const xs = serieFiltrada.map(r => r.ano);
  const ys = serieFiltrada.map(r => r.ipm);
  const oficial = serieFiltrada.map(r => r.ipm_oficial);

  const yValid = ys.filter(v => v !== null && v !== undefined);
  const media = yValid.reduce((s, v) => s + v, 0) / (yValid.length || 1);
  const yMax = Math.max(...yValid, 0.001) * 1.2;

  // maior e menor valor de toda a serie historica do municipio (nao so do periodo filtrado)
  const validos = serieCompleta.filter(r => r.ipm !== null && r.ipm !== undefined);
  const maxRec = validos.reduce((a, b) => (b.ipm > a.ipm ? b : a), validos[0]);
  const minRec = validos.reduce((a, b) => (b.ipm < a.ipm ? b : a), validos[0]);

  const traces = [{
    x: xs, y: ys, type: 'scatter', mode: 'lines+markers',
    line: { color: COLORS.line, width: 2.5, shape: 'linear' },
    marker: { color: COLORS.line, size: 5 },
    name: 'IPM',
    customdata: oficial.map(o => o === false ? 'Estimado — não distribuído oficialmente' : 'Oficial'),
    hovertemplate: 'Ano %{x}<br>IPM: %{y:.4f}%<br>%{customdata}<extra></extra>'
  },
  {
    x: [state.anoIni, state.anoFim], y: [media, media],
    type: 'scatter', mode: 'lines', line: { color: COLORS.mean, width: 1.5, dash: 'dash' },
    name: 'Média do período', hoverinfo: 'skip'
  }];

  // marcadores de maximo e minimo da serie historica, se estiverem no intervalo mostrado
  if (maxRec && maxRec.ano >= state.anoIni && maxRec.ano <= state.anoFim){
    traces.push({
      x: [maxRec.ano], y: [maxRec.ipm], type: 'scatter', mode: 'markers',
      marker: { color: COLORS.max, size: 13, symbol: 'triangle-up', line: { color: '#fff', width: 1 } },
      name: 'Maior valor da série',
      hovertemplate: `Maior valor da série<br>Ano %{x}: %{y:.4f}%<extra></extra>`
    });
  }
  if (minRec && minRec.ano >= state.anoIni && minRec.ano <= state.anoFim){
    traces.push({
      x: [minRec.ano], y: [minRec.ipm], type: 'scatter', mode: 'markers',
      marker: { color: COLORS.min, size: 11, symbol: 'square', line: { color: '#fff', width: 1 } },
      name: 'Menor valor da série',
      hovertemplate: `Menor valor da série<br>Ano %{x}: %{y:.4f}%<extra></extra>`
    });
  }

  const shapes = [];
  const annotations = [];
  if (state.anoIni <= 2024 && state.anoFim >= 2024){
    shapes.push({
      type: 'line', x0: 2024, x1: 2024, y0: 0, y1: 1, yref: 'paper',
      line: { color: COLORS.vline, width: 1.5, dash: 'dot' }
    });
    annotations.push({
      x: 2024, y: 1, yref: 'paper', yanchor: 'bottom', showarrow: false,
      text: 'novos critérios', font: { size: 10, color: COLORS.min, family: 'IBM Plex Mono' }
    });
  }

  let yAxis2 = null;
  if (state.indicador){
    const ysIndicador = serieFiltrada.map(r => r[state.indicador]);
    traces.push({
      x: xs, y: ysIndicador, type: 'scatter', mode: 'lines',
      line: { color: COLORS.correl, width: 2, dash: 'dashdot' },
      yaxis: 'y2', name: INDICADOR_LABEL[state.indicador],
      hovertemplate: `Ano %{x}<br>${INDICADOR_LABEL[state.indicador]}: %{y:.3f}%<extra></extra>`
    });
    yAxis2 = {
      overlaying: 'y', side: 'right', rangemode: 'tozero',
      title: { text: INDICADOR_LABEL[state.indicador], font: { size: 10 } },
      showgrid: false, tickfont: { size: 10 }
    };
  }

  const layout = {
    margin: { l: 55, r: state.indicador ? 55 : 20, t: 20, b: 40 },
    font: { family: 'Inter, sans-serif', size: 12, color: '#1E211F' },
    xaxis: { dtick: 1, tickangle: -45, gridcolor: '#EFEDE6' },
    yaxis: { title: 'IPM (%)', rangemode: 'tozero', range: [0, yMax], gridcolor: '#EFEDE6' },
    shapes, annotations,
    showlegend: false,
    hovermode: 'x unified',
    plot_bgcolor: '#fff', paper_bgcolor: '#fff'
  };
  // so adiciona o eixo secundario quando ele realmente existe -- mandar yaxis2:null
  // faz o Plotly falhar silenciosamente e nao desenhar nada no grafico
  if (yAxis2) layout.yaxis2 = yAxis2;

  Plotly.newPlot('chart-linha', traces, layout, { responsive: true, displayModeBar: false });

  renderCorrelacao(serieFiltrada);
}

function renderCorrelacao(serieFiltrada){
  const box = document.getElementById('correl-box');
  if (!state.indicador){ box.hidden = true; return; }

  const pares = serieFiltrada
    .filter(r => r.ipm !== null && r.ipm !== undefined && r[state.indicador] !== null && r[state.indicador] !== undefined);

  if (pares.length < 4){
    box.hidden = false;
    document.getElementById('correl-r').textContent = '—';
    document.getElementById('correl-desc').textContent = 'Dados insuficientes no período selecionado para calcular a correlação (mínimo de 4 anos com os dois indicadores disponíveis).';
    return;
  }

  const xs = pares.map(r => r.ipm);
  const ys = pares.map(r => r[state.indicador]);
  const { r, p } = pearsonComPValor(xs, ys);

  const forca = Math.abs(r) >= 0.8 ? 'muito forte' : Math.abs(r) >= 0.6 ? 'forte' : Math.abs(r) >= 0.3 ? 'moderada' : 'fraca';
  const sentido = r >= 0 ? 'positiva' : 'negativa';
  const sig = p < 0.05 ? 'estatisticamente significativa (p < 0,05)' : 'não estatisticamente significativa (p ≥ 0,05)';

  box.hidden = false;
  document.getElementById('correl-r').textContent = `r = ${r.toFixed(3)}`;
  document.getElementById('correl-desc').textContent =
    `Correlação ${sentido} ${forca} entre o IPM e ${INDICADOR_LABEL[state.indicador].toLowerCase()} — ${sig}, com base em ${pares.length} anos. p = ${p.toFixed(4)}.`;
}

/* ---------------- grafico de barras ---------------- */

function renderBarChart(){
  const serie = getSerieMunicipio(state.cd, state.anoIni, state.anoFim);
  const xs = serie.map(r => r.ano);
  const ys = serie.map(r => r.var_pct);
  const cores = ys.map(v => (v === null || v === undefined) ? '#D8D6CB' : (v >= 0 ? COLORS.bar_pos : COLORS.bar_neg));

  const trace = {
    x: xs, y: ys, type: 'bar', marker: { color: cores },
    hovertemplate: 'Ano %{x}<br>Variação: %{y:.2f}%<extra></extra>'
  };

  const layout = {
    margin: { l: 55, r: 20, t: 10, b: 40 },
    font: { family: 'Inter, sans-serif', size: 12, color: '#1E211F' },
    xaxis: { dtick: 1, tickangle: -45, gridcolor: '#EFEDE6' },
    yaxis: { title: 'Variação (%)', zeroline: true, zerolinecolor: '#999', gridcolor: '#EFEDE6' },
    plot_bgcolor: '#fff', paper_bgcolor: '#fff'
  };

  Plotly.newPlot('chart-barras', [trace], layout, { responsive: true, displayModeBar: false });
}

/* ---------------- tabela ---------------- */

function renderTable(){
  const serie = getSerieMunicipio(state.cd, state.anoIni, state.anoFim);
  const thInd = document.getElementById('th-indicador');
  thInd.textContent = state.indicador ? INDICADOR_LABEL[state.indicador].replace(' (% do estado)', ' (%)') : 'Indicador (%)';
  thInd.style.display = state.indicador ? '' : 'none';

  const tbody = document.querySelector('#tabela-dados tbody');
  tbody.innerHTML = serie.map(r => {
    const fmt = (v, d=4) => (v === null || v === undefined) ? '—' : v.toFixed(d);
    const varClasse = r.var_pct > 0 ? 'pos' : r.var_pct < 0 ? 'neg' : '';
    const badge = r.ipm_oficial === false ? '<span class="badge-naooficial">não oficial</span>' : '';
    const indCol = state.indicador ? `<td>${fmt(r[state.indicador], 3)}</td>` : '';
    return `<tr>
      <td>${r.ano}${badge}</td>
      <td>${fmt(r.ipm)}</td>
      <td class="${varClasse}">${fmt(r.var_abs)}</td>
      <td class="${varClasse}">${fmt(r.var_pct, 2)}</td>
      <td>${r.ranking ?? '—'}º</td>
      ${indCol}
    </tr>`;
  }).join('');

  document.querySelectorAll('#tabela-dados td:nth-child(6), #tabela-dados th:nth-child(6)').forEach(el => {
    el.style.display = state.indicador ? '' : 'none';
  });
}

/* ---------------- mapa animado ---------------- */

function percentil(arr, p){
  const s = [...arr].sort((a,b) => a-b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function renderMap(){
  const codes = GEO.features.map(f => f.properties.CD_MUN);
  const layerKey = state.mapLayer; // 'ipm' ou 'var_pct'
  const label = layerKey === 'ipm' ? 'IPM (%)' : 'Variação anual (%)';
  // paletas vivas, de alto contraste, com mais estagios na faixa baixa
  // (onde fica a maioria dos municipios, que tem IPM pequeno)
  const colorscale = layerKey === 'ipm'
    ? [[0,'#FFF7DE'],[0.1,'#FEE08B'],[0.25,'#FDB255'],[0.42,'#F2792E'],[0.6,'#D8431F'],[0.78,'#A81F2C'],[1,'#5B0F24']]
    : [[0,'#8B1A2B'],[0.22,'#E0654F'],[0.46,'#FDEFD9'],[0.54,'#FDEFD9'],[0.78,'#3F9D72'],[1,'#0B5C3C']];

  // range de cor baseado em percentil, mais apertado no topo para o IPM
  // (poucos municipios grandes dominam o topo da escala; isso da mais
  // diferenciacao visual para a maioria, que fica na faixa baixa/media)
  let allVals = [];
  ANOS.forEach(ano => {
    codes.forEach(cd => {
      const rec = SERIES[cd] && SERIES[cd].anos[String(ano)];
      const v = rec ? rec[layerKey] : null;
      if (v !== null && v !== undefined) allVals.push(v);
    });
  });
  let zmin, zmax;
  if (layerKey === 'ipm'){
    zmin = 0; zmax = percentil(allVals, 0.90);
  } else {
    const maxAbs = Math.max(Math.abs(percentil(allVals, 0.05)), Math.abs(percentil(allVals, 0.95)));
    zmin = -maxAbs; zmax = maxAbs;
  }

  const frames = ANOS.map(ano => {
    const z = codes.map(cd => {
      const rec = SERIES[cd] && SERIES[cd].anos[String(ano)];
      return rec ? rec[layerKey] : null;
    });
    return {
      name: String(ano),
      data: [{ z, locations: codes }]
    };
  });

  const zInicial = codes.map(cd => {
    const rec = SERIES[cd] && SERIES[cd].anos[String(ANOS[0])];
    return rec ? rec[layerKey] : null;
  });

  const trace = {
    type: 'choroplethmapbox',
    geojson: GEO,
    locations: codes,
    z: zInicial,
    featureidkey: 'properties.CD_MUN',
    colorscale, zmin, zmax,
    marker: { opacity: 0.82, line: { color: '#2B2B2B', width: 0.35 } },
    colorbar: { title: { text: label, font: { size: 11 } }, thickness: 14 },
    hovertemplate: '%{location}<br>' + label + ': %{z:.3f}<extra></extra>'
  };

  const layout = {
    mapbox: {
      style: 'carto-positron',
      center: { lat: -30.1, lon: -53.2 },
      zoom: 5.6
    },
    margin: { l: 0, r: 0, t: 10, b: 80 },
    paper_bgcolor: '#FFFFFF',
    updatemenus: [{
      type: 'buttons', showactive: false, x: 0, y: -0.05, xanchor: 'left', yanchor: 'top',
      pad: { t: 0, r: 10 },
      buttons: [{
        label: '▶ Reproduzir',
        method: 'animate',
        args: [null, { frame: { duration: 650, redraw: true }, fromcurrent: true, transition: { duration: 200 } }]
      }, {
        label: '❚❚ Pausar',
        method: 'animate',
        args: [[null], { mode: 'immediate', frame: { duration: 0, redraw: false } }]
      }]
    }],
    sliders: [{
      x: 0.16, y: -0.05, len: 0.82, xanchor: 'left',
      pad: { t: 0, l: 0, r: 0 },
      currentvalue: { prefix: 'Ano: ', font: { family: 'IBM Plex Mono', size: 13 }, xanchor: 'left' },
      steps: ANOS.map(ano => ({
        label: String(ano), method: 'animate',
        args: [[String(ano)], { mode: 'immediate', frame: { duration: 300, redraw: true }, transition: { duration: 150 } }]
      }))
    }]
  };

  Plotly.newPlot('chart-mapa', [trace], layout, { responsive: true, displayModeBar: false }).then(() => {
    Plotly.addFrames('chart-mapa', frames);
  });
}

/* ---------------- estatistica: pearson + valor-p ---------------- */

function pearsonComPValor(xs, ys){
  const n = xs.length;
  const mx = xs.reduce((a,b) => a+b, 0) / n;
  const my = ys.reduce((a,b) => a+b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++){
    const dx = xs[i]-mx, dy = ys[i]-my;
    cov += dx*dy; vx += dx*dx; vy += dy*dy;
  }
  const r = cov / Math.sqrt(vx * vy);
  const df = n - 2;
  const t = r * Math.sqrt(df / (1 - r*r + 1e-12));
  const p = betai(df/2, 0.5, df / (df + t*t));
  return { r, p };
}

// regularized incomplete beta function (Numerical Recipes) — usada para o valor-p da correlacao
function betacf(x, a, b){
  const MAXIT = 200, EPS = 3e-9, FPMIN = 1e-30;
  let qab = a+b, qap = a+1, qam = a-1;
  let c = 1, d = 1 - qab*x/qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1/d; let h = d;
  for (let m = 1; m <= MAXIT; m++){
    const m2 = 2*m;
    let aa = m*(b-m)*x/((qam+m2)*(a+m2));
    d = 1 + aa*d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa/c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1/d; h *= d*c;
    aa = -(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
    d = 1 + aa*d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa/c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1/d; const del = d*c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function logGamma(x){
  const cof = [76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x+0.5)*Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++){ y += 1; ser += cof[j]/y; }
  return -tmp + Math.log(2.5066282746310005*ser/x);
}
function betai(a, b, x){
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a+b) - logGamma(a) - logGamma(b) + a*Math.log(x) + b*Math.log(1-x));
  if (x < (a+1)/(a+b+2)) return bt * betacf(x,a,b) / a;
  return 1 - bt * betacf(1-x, b, a) / b;
}

/* ---------------- exportacao em PDF ---------------- */

async function exportarPDF(){
  const btn = document.getElementById('btn-pdf');
  btn.disabled = true; btn.textContent = 'Gerando PDF…';

  const nome = SERIES[state.cd].nome;
  const el = document.getElementById('report-content');

  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
  const img = canvas.toDataURL('image/png');

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
  pdf.text('Boletim do IPM — Rio Grande do Sul', 14, 16);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  pdf.text(`Município: ${nome}  ·  Período: ${state.anoIni}–${state.anoFim}  ·  Índice: IPM (Índice de Participação dos Municípios)`, 14, 23);

  const imgW = pageW - 28;
  const imgH = imgW * canvas.height / canvas.width;
  let heightLeft = imgH;
  let position = 30;

  pdf.addImage(img, 'PNG', 14, position, imgW, imgH);
  heightLeft -= (pageH - position);

  while (heightLeft > 0){
    pdf.addPage();
    position = heightLeft - imgH + 10;
    pdf.addImage(img, 'PNG', 14, position, imgW, imgH);
    heightLeft -= pageH;
  }

  pdf.save(`IPM_${nome.replace(/\s+/g,'_')}_${state.anoIni}-${state.anoFim}.pdf`);

  btn.disabled = false; btn.textContent = 'Exportar PDF';
}
