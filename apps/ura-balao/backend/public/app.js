/* =========================================================================
   URA ATIVA BALÃO - SCRIPT FRONTEND (JS PURO)
   ========================================================================= */

// Utilitário para exibir notificações Toast
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) {
    const newContainer = document.createElement('div');
    newContainer.id = 'toast-container';
    newContainer.className = 'toast-container';
    document.body.appendChild(newContainer);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;
  
  document.getElementById('toast-container').appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Verifica autenticação da página
async function checkAuth() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    
    // Se não estiver autenticado e não estiver na página de login, redireciona
    if (!data.authenticated && !window.location.pathname.endsWith('login.html')) {
      window.location.href = '/login.html';
    }
    // Se estiver autenticado e na página de login, redireciona para dashboard
    if (data.authenticated && window.location.pathname.endsWith('login.html')) {
      window.location.href = '/dashboard.html';
    }
  } catch (err) {
    console.error('Erro ao verificar sessão:', err);
  }
}

// Executa logout do usuário
async function logout() {
  try {
    const res = await fetch('/api/logout', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Logout realizado.', 'success');
      setTimeout(() => { window.location.href = '/login.html'; }, 800);
    } else {
      showToast('Erro ao fazer logout.', 'error');
    }
  } catch (err) {
    showToast('Falha de rede ao deslogar.', 'error');
  }
}

// Inicializa o menu de navegação e destaca a página ativa
function initNavigation() {
  const currentPath = window.location.pathname;
  const links = document.querySelectorAll('.nav-link');
  
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (currentPath.includes(href)) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Vincula botão de logout
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
}

// =========================================================================
// PÁGINA: DASHBOARD
// =========================================================================
async function loadDashboard() {
  const container = document.getElementById('dashboard-stats');
  if (!container) return; // Não está no dashboard

  try {
    const res = await fetch('/api/dashboard');
    const data = await res.json();

    document.getElementById('stat-total-clients').textContent = data.total_clients || 0;
    document.getElementById('stat-total-calls').textContent = data.total_calls || 0;
    document.getElementById('stat-calls-answered').textContent = data.calls_answered || 0;
    document.getElementById('stat-calls-failed').textContent = data.calls_failed || 0;
    document.getElementById('stat-pressed-1').textContent = data.pressed_1 || 0;
    document.getElementById('stat-pressed-2').textContent = data.pressed_2 || 0;
    document.getElementById('stat-blacklist-count').textContent = data.blacklist_count || 0;

    // Atualiza status do sistema
    const sysStatus = document.getElementById('system-status');
    if (data.ami_connected) {
      sysStatus.textContent = 'Conectado ao Asterisk (AMI)';
      sysStatus.style.color = 'var(--success-color)';
    } else {
      sysStatus.textContent = 'Asterisk AMI Desconectado';
      sysStatus.style.color = 'var(--primary-color)';
    }
  } catch (err) {
    showToast('Erro ao carregar dados do dashboard.', 'error');
  }
}

// =========================================================================
// PÁGINA: CLIENTES
// =========================================================================
async function loadClients() {
  const tableBody = document.getElementById('clients-table-body');
  if (!tableBody) return;

  try {
    const res = await fetch('/api/clients');
    const clients = await res.json();
    
    tableBody.innerHTML = '';
    
    if (clients.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">Nenhum cliente cadastrado.</td></tr>';
      return;
    }

    clients.forEach(c => {
      let statusBadge = '';
      switch (c.status) {
        case 'PENDENTE': statusBadge = `<span class="badge badge-pending">Pendente</span>`; break;
        case 'EM_CHAMADA': statusBadge = `<span class="badge badge-calling">Em Chamada</span>`; break;
        case 'COMPLETADA': statusBadge = `<span class="badge badge-success">Completada</span>`; break;
        case 'FALHOU': statusBadge = `<span class="badge badge-fail">Falhou</span>`; break;
        case 'BLOQUEADO': statusBadge = `<span class="badge badge-black">Bloqueado (9)</span>`; break;
        case 'PEDIU_ATENDENTE': statusBadge = `<span class="badge badge-success">Atendente (1)</span>`; break;
        case 'QUER_WHATSAPP': statusBadge = `<span class="badge badge-success">WhatsApp (2)</span>`; break;
        case 'SEM_RESPOSTA': statusBadge = `<span class="badge badge-warn">Sem Resposta</span>`; break;
        case 'OPCAO_INVALIDA': statusBadge = `<span class="badge badge-fail">Opção Inválida</span>`; break;
        default: statusBadge = `<span class="badge badge-pending">${c.status}</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.id}</td>
        <td><strong>${c.name}</strong></td>
        <td>${c.phone}</td>
        <td>${c.reason || '<span style="color:#555">Não informado</span>'}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-secondary btn-danger" style="padding: 6px 12px; font-size: 12px;" onclick="deleteClient(${c.id})">Excluir</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    showToast('Erro ao carregar clientes.', 'error');
  }
}

async function deleteClient(id) {
  if (!confirm('Deseja realmente excluir este cliente?')) return;
  try {
    const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Cliente removido.');
      loadClients();
    } else {
      showToast(data.error || 'Erro ao remover cliente.', 'error');
    }
  } catch (err) {
    showToast('Erro de rede ao remover cliente.', 'error');
  }
}

// Cadastro manual de cliente
const clientForm = document.getElementById('client-form');
if (clientForm) {
  clientForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('client-name').value;
    const phone = document.getElementById('client-phone').value;
    const reason = document.getElementById('client-reason').value;
    const note = document.getElementById('client-note').value;

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, reason, note })
      });
      const data = await res.json();

      if (res.ok) {
        showToast('Cliente cadastrado com sucesso.');
        clientForm.reset();
        loadClients();
      } else {
        showToast(data.error || 'Erro ao cadastrar cliente.', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão ao cadastrar cliente.', 'error');
    }
  });
}

// Importação CSV/Texto colado
const importForm = document.getElementById('import-form');
if (importForm) {
  importForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = document.getElementById('import-content').value;

    try {
      const res = await fetch('/api/clients/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();

      if (data.success) {
        showToast(`Importação finalizada! Sucessos: ${data.importedCount}, Erros: ${data.errorsCount}`);
        document.getElementById('import-content').value = '';
        
        if (data.errors && data.errors.length > 0) {
          console.warn('Erros de importação:', data.errors);
          alert('Algumas linhas falharam na importação. Verifique o console do navegador para ver o relatório detalhado.');
        }

        loadClients();
      } else {
        showToast(data.error || 'Erro na importação.', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão ao importar lote.', 'error');
    }
  });
}

// =========================================================================
// PÁGINA: CAMPANHAS
// =========================================================================
async function loadCampaigns() {
  const tableBody = document.getElementById('campaigns-table-body');
  if (!tableBody) return;

  try {
    const res = await fetch('/api/campaigns');
    const campaigns = await res.json();
    
    tableBody.innerHTML = '';
    
    if (campaigns.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">Nenhuma campanha cadastrada.</td></tr>';
      return;
    }

    campaigns.forEach(c => {
      let statusBadge = '';
      let actionButtons = '';

      switch (c.status) {
        case 'INATIVA':
          statusBadge = `<span class="badge badge-pending">Inativa</span>`;
          actionButtons = `<button class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="startCampaign(${c.id})">Iniciar</button>`;
          break;
        case 'ATIVA':
          statusBadge = `<span class="badge badge-calling">Ativa</span>`;
          actionButtons = `
            <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px; margin-right:5px;" onclick="pauseCampaign(${c.id})">Pausar</button>
            <button class="btn btn-danger" style="padding: 6px 12px; font-size: 12px;" onclick="stopCampaign(${c.id})">Parar</button>
          `;
          break;
        case 'PAUSADA':
          statusBadge = `<span class="badge badge-warn">Pausada</span>`;
          actionButtons = `
            <button class="btn btn-primary" style="padding: 6px 12px; font-size: 12px; margin-right:5px;" onclick="startCampaign(${c.id})">Retomar</button>
            <button class="btn btn-danger" style="padding: 6px 12px; font-size: 12px;" onclick="stopCampaign(${c.id})">Parar</button>
          `;
          break;
        case 'PARADA':
          statusBadge = `<span class="badge badge-fail">Parada</span>`;
          actionButtons = `<button class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="startCampaign(${c.id})">Reiniciar</button>`;
          break;
        case 'COMPLETADA':
          statusBadge = `<span class="badge badge-success">Concluída</span>`;
          actionButtons = `<button class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="startCampaign(${c.id})">Rodar Novamente</button>`;
          break;
        default:
          statusBadge = `<span class="badge badge-pending">${c.status}</span>`;
      }

      const stats = c.stats || { total: 0, pendentes: 0, em_chamada: 0, completados: 0, falhados: 0, bloqueados: 0 };
      const progress = stats.total > 0 ? Math.round(((stats.total - stats.pendentes) / stats.total) * 100) : 0;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.id}</td>
        <td><strong>${c.name}</strong><br><small style="color:var(--text-secondary)">${c.display_message || c.message}</small></td>
        <td>${c.calls_per_minute}/min (Máx ${c.max_attempts} tent)</td>
        <td>${c.start_hour} - ${c.end_hour}</td>
        <td>${statusBadge}</td>
        <td>
          <div style="font-weight:600; margin-bottom:4px;">${progress}% (${stats.total - stats.pendentes}/${stats.total})</div>
          <small style="color:var(--text-secondary)">Sucessos: ${stats.completados || 0} | Falhas: ${stats.falhados || 0}</small>
        </td>
        <td>
          ${actionButtons}
        </td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    showToast('Erro ao carregar campanhas.', 'error');
  }
}

async function startCampaign(id) {
  if (!confirm('Deseja iniciar/retomar esta campanha? Certifique-se de que a URA está configurada corretamente.')) return;
  try {
    const res = await fetch(`/api/campaigns/${id}/start`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast('Campanha iniciada.');
      loadCampaigns();
    } else {
      alert(data.error || 'Erro ao iniciar campanha.');
    }
  } catch (err) {
    showToast('Erro de rede ao iniciar campanha.', 'error');
  }
}

async function pauseCampaign(id) {
  try {
    const res = await fetch(`/api/campaigns/${id}/pause`, { method: 'POST' });
    if (res.ok) {
      showToast('Campanha pausada.');
      loadCampaigns();
    }
  } catch (err) {
    showToast('Erro de rede.', 'error');
  }
}

async function stopCampaign(id) {
  if (!confirm('Tem certeza que deseja interromper definitivamente esta campanha?')) return;
  try {
    const res = await fetch(`/api/campaigns/${id}/stop`, { method: 'POST' });
    if (res.ok) {
      showToast('Campanha parada.');
      loadCampaigns();
    }
  } catch (err) {
    showToast('Erro de rede.', 'error');
  }
}

const campaignCategory = document.getElementById('campaign-category');
if (campaignCategory) {
  loadCatalogProducts(campaignCategory.value, 'campaign-product');
  campaignCategory.addEventListener('change', () => loadCatalogProducts(campaignCategory.value, 'campaign-product'));
}

const loadCampaignUrlBtn = document.getElementById('btn-load-campaign-url');
if (loadCampaignUrlBtn) {
  loadCampaignUrlBtn.addEventListener('click', () => loadCatalogProductByUrl('campaign-product-url', 'campaign-product'));
}

// Criação de nova campanha
const campaignForm = document.getElementById('campaign-form');
if (campaignForm) {
  campaignForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('campaign-name').value;
    const message = document.getElementById('campaign-message').value.trim();
    const product = getSelectedCatalogProduct('campaign-product');
    const calls_per_minute = parseInt(document.getElementById('campaign-cpm').value, 10);
    const max_attempts = parseInt(document.getElementById('campaign-attempts').value, 10);
    const start_hour = document.getElementById('campaign-start-hour').value;
    const end_hour = document.getElementById('campaign-end-hour').value;

    if (!product && !message) {
      showToast('Selecione um produto do balao.info ou preencha uma mensagem manual.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message, product, calls_per_minute, max_attempts, start_hour, end_hour })
      });
      const data = await res.json();

      if (res.ok) {
        showToast('Campanha criada com sucesso.');
        campaignForm.reset();
        if (campaignCategory) {
          campaignCategory.value = 'ssd';
          loadCatalogProducts(campaignCategory.value, 'campaign-product');
        }
        loadCampaigns();
      } else {
        showToast(data.error || 'Erro ao criar campanha.', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão.', 'error');
    }
  });
}

// =========================================================================
// PÁGINA: HISTÓRICO DE CHAMADAS / TESTE AVULSO
// =========================================================================
function renderCallActions(call) {
  const actions = [];
  const actionStyle = 'padding: 6px 10px; font-size: 12px; text-decoration: none; margin-right: 6px; margin-bottom: 6px; display: inline-block;';

  if (call.digit === '2' && call.whatsapp_link_url) {
    actions.push(`<a class="btn btn-primary" style="${actionStyle}" href="${call.whatsapp_link_url}" target="_blank" rel="noopener noreferrer">Enviar link</a>`);
  }

  if (call.digit === '2' && call.offer_url) {
    actions.push(`<a class="btn btn-secondary" style="${actionStyle}" href="${call.offer_url}" target="_blank" rel="noopener noreferrer">Ver oferta</a>`);
  }

  if (call.digit === '1' && call.dial_url) {
    actions.push(`<a class="btn btn-secondary" style="${actionStyle}" href="${call.dial_url}">Ligar</a>`);
  }

  if (call.digit === '1' && call.attendant_whatsapp_url) {
    actions.push(`<a class="btn btn-primary" style="${actionStyle}" href="${call.attendant_whatsapp_url}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>`);
  }

  if (actions.length === 0) {
    return '<span style="color: var(--text-secondary);">Sem ação</span>';
  }

  return actions.join('');
}

async function loadCalls() {
  const tableBody = document.getElementById('calls-table-body');
  if (!tableBody) return;

  try {
    const res = await fetch('/api/calls');
    const calls = await res.json();
    
    tableBody.innerHTML = '';
    
    if (calls.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-secondary);">Nenhuma chamada registrada no histórico.</td></tr>';
      return;
    }

    calls.forEach(c => {
      let statusBadge = '';
      switch (c.status) {
        case 'DISPARANDO': statusBadge = `<span class="badge badge-pending">Disparando</span>`; break;
        case 'ATENDIDA': statusBadge = `<span class="badge badge-success">Atendida</span>`; break;
        case 'COMPLETADA': statusBadge = `<span class="badge badge-success">Completada</span>`; break;
        case 'FALHOU': statusBadge = `<span class="badge badge-fail">Falhou</span>`; break;
        default: statusBadge = `<span class="badge badge-pending">${c.status}</span>`;
      }

      let outcome = c.result || '-';
      if (c.digit) {
        outcome = `${c.result} (Tecla ${c.digit})`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.id}</td>
        <td><strong>${c.client_name || 'Desconhecido'}</strong><br><small style="color:var(--text-secondary)">${c.phone}</small></td>
        <td>${c.campaign_name || 'Chamada Avulsa'}</td>
        <td>${statusBadge}</td>
        <td>${outcome}</td>
        <td>${c.duration}s</td>
        <td>Tentativa ${c.attempt}</td>
        <td>${new Date(c.created_at).toLocaleString('pt-BR')}</td>
        <td>${renderCallActions(c)}</td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    showToast('Erro ao buscar logs de chamadas.', 'error');
  }
}

async function loadCatalogProducts(category, selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '<option value="">Carregando produtos...</option>';

  try {
    const res = await fetch(`/api/campaigns/catalog/products?category=${encodeURIComponent(category)}`);
    const products = await res.json();
    if (!res.ok) throw new Error(products.error || 'Falha ao carregar catálogo.');
    select.innerHTML = products.length
      ? products.map(p => `<option value='${encodeURIComponent(JSON.stringify(p))}'>${p.title}${p.price ? ` - R$ ${p.price}` : ''}</option>`).join('')
      : '<option value="">Nenhum produto encontrado</option>';
  } catch (err) {
    select.innerHTML = '<option value="">Erro ao carregar catálogo</option>';
  }
}

async function loadCatalogProductByUrl(urlInputId, selectId) {
  const urlInput = document.getElementById(urlInputId);
  const select = document.getElementById(selectId);
  const url = urlInput?.value.trim();

  if (!url || !select) {
    showToast('Informe a URL do produto do balao.info.', 'error');
    return;
  }

  select.innerHTML = '<option value="">Carregando produto...</option>';

  try {
    const res = await fetch(`/api/campaigns/catalog/product-by-url?url=${encodeURIComponent(url)}`);
    const product = await res.json();
    if (!res.ok) throw new Error(product.error || 'Falha ao carregar produto.');

    select.innerHTML = `<option value='${encodeURIComponent(JSON.stringify(product))}'>${product.title}${product.price ? ` - R$ ${product.price}` : ''}</option>`;
    showToast('Produto carregado pela URL.');
  } catch (err) {
    select.innerHTML = '<option value="">Erro ao carregar produto</option>';
    showToast(err.message || 'Erro ao carregar produto pela URL.', 'error');
  }
}

function getSelectedCatalogProduct(selectId) {
  const raw = document.getElementById(selectId)?.value;
  return raw ? JSON.parse(decodeURIComponent(raw)) : null;
}

const testCategory = document.getElementById('test-category');
if (testCategory) {
  loadCatalogProducts(testCategory.value, 'test-product');
  testCategory.addEventListener('change', () => loadCatalogProducts(testCategory.value, 'test-product'));
}

const loadTestUrlBtn = document.getElementById('btn-load-test-url');
if (loadTestUrlBtn) {
  loadTestUrlBtn.addEventListener('click', () => loadCatalogProductByUrl('test-product-url', 'test-product'));
}

// Disparo de teste de ligação manual avulsa
const testCallForm = document.getElementById('test-call-form');
if (testCallForm) {
  testCallForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('test-phone').value;
    const product = getSelectedCatalogProduct('test-product');
    const reason = product ? product.title : 'promocao';

    const btn = testCallForm.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Ligando...';

    try {
      const res = await fetch('/api/sip-diagnostic/test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, reason, product })
      });
      const data = await res.json();

      if (res.ok) {
        showToast(data.message || 'Chamada enviada com sucesso.');
        loadCalls();
      } else {
        alert(data.error || 'Erro ao realizar ligação de teste.');
      }
    } catch (err) {
      showToast('Erro ao conectar ao servidor.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });
}

// =========================================================================
// PÁGINA: CONFIGURAÇÕES
// =========================================================================
async function loadSettings() {
  const form = document.getElementById('settings-form');
  if (!form) return;

  try {
    const res = await fetch('/api/settings');
    const configs = await res.json();

    for (const [key, value] of Object.entries(configs)) {
      const input = document.getElementById(`config-${key}`);
      if (input) {
        input.value = value;
      }
    }

    // Mostra status AMI
    const amiBadge = document.getElementById('settings-ami-status');
    if (amiBadge) {
      if (configs.AMI_CONNECTED) {
        amiBadge.textContent = 'CONEXÃO AMI ATIVA';
        amiBadge.style.color = 'var(--success-color)';
      } else {
        amiBadge.textContent = 'CONEXÃO AMI DESCONECTADA';
        amiBadge.style.color = 'var(--primary-color)';
      }
    }
  } catch (err) {
    showToast('Erro ao carregar configurações.', 'error');
  }
}

const settingsForm = document.getElementById('settings-form');
if (settingsForm) {
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const body = {};
    const inputs = settingsForm.querySelectorAll('input, select');
    inputs.forEach(input => {
      const key = input.id.replace('config-', '');
      body[key] = input.value;
    });

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (data.success) {
        showToast('Configurações salvas.');
        loadSettings();
      } else {
        showToast('Erro ao salvar.', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão.', 'error');
    }
  });
}

async function testAmiConnection() {
  const btn = document.getElementById('btn-test-ami');
  if (!btn) return;
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Testando...';

  try {
    const res = await fetch('/api/settings/test-ami', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      alert(`Sucesso: ${data.message}`);
      loadSettings();
    } else {
      alert(`Falha: ${data.message}`);
    }
  } catch (err) {
    alert('Erro de conexão ao testar AMI.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// =========================================================================
// PÁGINA: DIAGNÓSTICO SIP
// =========================================================================
let diagLog = '';

function addDiagLog(msg) {
  const logBox = document.getElementById('diag-logs');
  if (!logBox) return;
  
  const now = new Date().toLocaleTimeString('pt-BR');
  diagLog += `[${now}] ${msg}\n`;
  logBox.textContent = diagLog;
  logBox.scrollTop = logBox.scrollHeight;
}

async function runAutoPortScan() {
  const btn = document.getElementById('btn-scan-ports');
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = 'Escaneando portas...';
  
  diagLog = '';
  addDiagLog('Iniciando varredura de portas SIP...');

  try {
    const res = await fetch('/api/sip-diagnostic/ports');
    const data = await res.json();

    if (data.success) {
      addDiagLog('Varredura concluída. Resultados:\n');
      let foundActive = false;
      let activePort = null;

      data.results.forEach(r => {
        addDiagLog(`Porta ${r.port}: ${r.status} (${r.details})`);
        if (r.success) {
          foundActive = true;
          activePort = r.port;
        }
      });

      if (foundActive) {
        addDiagLog(`\nSUCESSO: Porta SIP ativa encontrada: ${activePort}`);
        showToast(`Porta SIP ativa encontrada: ${activePort}`, 'success');
        document.getElementById('discovered-port').value = activePort;
        document.getElementById('save-discovered-port-container').style.display = 'block';
      } else {
        addDiagLog('\nAVISO: Nenhuma porta SIP ativa respondeu. Tente testar manualmente ou verifique seu provedor.');
        showToast('Nenhuma porta ativa respondendo.', 'error');
      }
    } else {
      addDiagLog(`Erro na varredura: ${data.error}`);
    }
  } catch (err) {
    addDiagLog(`Erro de rede na varredura: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Buscar Portas SIP (Auto)';
  }
}

async function testSinglePortManual() {
  const port = document.getElementById('manual-sip-port').value;
  if (!port) {
    alert('Digite uma porta.');
    return;
  }

  addDiagLog(`Testando porta manual: ${port}...`);

  try {
    const res = await fetch('/api/sip-diagnostic/test-port', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port })
    });
    const data = await res.json();

    addDiagLog(`Resultado porta ${data.port}: ${data.status} (${data.details})`);
    
    if (data.success) {
      showToast(`Porta ${port} respondendo!`, 'success');
      document.getElementById('discovered-port').value = port;
      document.getElementById('save-discovered-port-container').style.display = 'block';
    } else {
      showToast(`Porta ${port} não respondeu.`, 'error');
    }
  } catch (err) {
    addDiagLog(`Erro ao testar porta: ${err.message}`);
  }
}

async function saveDiscoveredPort() {
  const port = document.getElementById('discovered-port').value;
  if (!port) return;

  try {
    const res = await fetch('/api/sip-diagnostic/save-port', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message);
      addDiagLog(`Porta ${port} salva nas configurações como principal.`);
      document.getElementById('save-discovered-port-container').style.display = 'none';
    } else {
      showToast('Falha ao salvar porta.', 'error');
    }
  } catch (err) {
    showToast('Erro de rede ao salvar.', 'error');
  }
}

async function testSipRegistration() {
  const btn = document.getElementById('btn-test-registration');
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = 'Testando Registro...';

  addDiagLog('Consultando status de registro SIP no Asterisk...');

  try {
    const res = await fetch('/api/sip-diagnostic/test-registration', { method: 'POST' });
    const data = await res.json();

    addDiagLog(`Resultado do Registro SIP: ${data.status}`);
    addDiagLog(`Detalhes:\n${data.details}`);
    
    if (data.success) {
      showToast('Registro SIP ativo!', 'success');
    } else {
      showToast('Registro SIP inativo.', 'error');
    }
  } catch (err) {
    addDiagLog(`Erro ao consultar registro: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Testar Registro SIP';
  }
}

// =========================================================================
// INICIALIZAÇÃO GERAL DA PÁGINA
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  initNavigation();

  // Roda rotinas de carregamento de páginas específicas
  loadDashboard();
  loadClients();
  loadCampaigns();
  loadCalls();
  loadSettings();
  
  // Polling automático no dashboard e na fila de chamadas se estiver ativo
  if (document.getElementById('dashboard-stats')) {
    setInterval(loadDashboard, 5000);
  }
  if (document.getElementById('calls-table-body')) {
    setInterval(loadCalls, 4000);
  }
});
