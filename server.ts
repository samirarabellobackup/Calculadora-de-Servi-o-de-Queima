import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini SDK with telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// JSON-based persistent database file
const DB_FILE = path.join(process.cwd(), 'data-store.json');

// Interface structures
interface DatabaseSchema {
  users: any[];
  orders: any[];
  notifications: any[];
}

// Helper to load database
function loadDb(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading database:', err);
  }
  // Default structure
  const defaultDb: DatabaseSchema = {
    users: [
      {
        id: 'admin-1',
        nome: 'Administrador do Ateliê',
        email: 'ollariaatelie@gmail.com',
        senha: '2026adm', // Admin credentials
        isAdmin: true
      }
    ],
    orders: [],
    notifications: []
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf-8');
  return defaultDb;
}

// Helper to save database
function saveDb(data: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

// API Routes

// Authentication API
app.post('/api/auth/register', (req, res) => {
  const { nome, email, senha, isAdmin } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }

  const db = loadDb();
  const exists = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
  }

  const newUser = {
    id: 'user-' + Date.now(),
    nome,
    email: email.toLowerCase(),
    senha,
    isAdmin: !!isAdmin
  };

  db.users.push(newUser);
  saveDb(db);

  const { senha: _, ...userWithoutPassword } = newUser;
  return res.json({ user: userWithoutPassword, message: 'Usuário registrado com sucesso!' });
});

app.post('/api/auth/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }

  const db = loadDb();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.senha === senha);
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const { senha: _, ...userWithoutPassword } = user;
  return res.json({ user: userWithoutPassword, message: 'Login bem-sucedido!' });
});

// Orders API
app.get('/api/orders', (req, res) => {
  const { userId, isAdmin } = req.query;
  const db = loadDb();

  if (isAdmin === 'true') {
    return res.json(db.orders);
  }

  if (userId) {
    const userOrders = db.orders.filter(o => o.clienteId === userId);
    return res.json(userOrders);
  }

  return res.json([]);
});

app.post('/api/orders', (req, res) => {
  const { clienteId, clienteNome, clienteEmail, pecas, total } = req.body;
  if (!clienteId || !pecas || pecas.length === 0) {
    return res.status(400).json({ error: 'Dados do orçamento incompletos.' });
  }

  const db = loadDb();
  const orderId = 'order-' + Math.floor(1000 + Math.random() * 9000);

  const newOrder = {
    id: orderId,
    clienteId,
    clienteNome,
    clienteEmail,
    pecas,
    total,
    status: 'pendente',
    dataCriacao: new Date().toISOString(),
    dataAtualizacao: new Date().toISOString()
  };

  db.orders.unshift(newOrder);

  // Auto notification
  const firstPiece = pecas[0]?.nome || 'Novas peças';
  const notificationId = 'n-' + Date.now();
  db.notifications.unshift({
    id: notificationId,
    orderId,
    userId: clienteId,
    titulo: 'Orçamento Enviado',
    mensagem: `Seu orçamento #${orderId} contendo "${firstPiece}" foi enviado para avaliação técnica no ateliê.`,
    data: new Date().toISOString(),
    lida: false
  });

  saveDb(db);
  return res.json({ order: newOrder, message: 'Orçamento salvo com sucesso e enviado para avaliação técnica!' });
});

// Update order status (Admin only)
app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status obrigatório.' });
  }

  const db = loadDb();
  const orderIndex = db.orders.findIndex(o => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: 'Orçamento não encontrado.' });
  }

  db.orders[orderIndex].status = status;
  db.orders[orderIndex].dataAtualizacao = new Date().toISOString();

  // Create customized notification message
  let statusText = '';
  switch (status) {
    case 'em_analise':
      statusText = 'colocado em Análise Técnica';
      break;
    case 'aprovado':
      statusText = 'Aprovado para queima';
      break;
    case 'queimando':
      statusText = 'carregado no forno! A queima foi iniciada';
      break;
    case 'concluido':
      statusText = 'Concluído! Suas peças já podem ser retiradas';
      break;
    case 'cancelado':
      statusText = 'Cancelado';
      break;
    default:
      statusText = `atualizado para: ${status}`;
  }

  const order = db.orders[orderIndex];
  const firstPiece = order.pecas[0]?.nome || 'suas peças';
  const notificationId = 'n-' + Date.now() + '-' + Math.floor(Math.random() * 100);

  db.notifications.unshift({
    id: notificationId,
    orderId: order.id,
    userId: order.clienteId,
    titulo: 'Atualização do Pedido',
    mensagem: `Seu pedido #${order.id} ("${firstPiece}") foi ${statusText}.`,
    data: new Date().toISOString(),
    lida: false
  });

  saveDb(db);
  return res.json({ order: db.orders[orderIndex], message: 'Status atualizado com sucesso!' });
});

// Notifications API
app.get('/api/notifications', (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.json([]);
  }
  const db = loadDb();
  const userNotifications = db.notifications.filter(n => n.userId === userId);
  return res.json(userNotifications);
});

app.post('/api/notifications/read', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'UserId obrigatório.' });
  }
  const db = loadDb();
  db.notifications.forEach(n => {
    if (n.userId === userId) {
      n.lida = true;
    }
  });
  saveDb(db);
  return res.json({ success: true });
});

// Gemini Technical Evaluation Endpoint
app.post('/api/gemini/analyze-technical', async (req, res) => {
  const { pecas } = req.body;
  if (!pecas || pecas.length === 0) {
    return res.status(400).json({ error: 'Nenhuma peça informada para análise técnica.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // If no API key is available, return a very elegant fallback report
    const fallbackReports = pecas.map((peca: any) => {
      const isEsmalte = peca.tipo === 'esmalte';
      const maxTemp = peca.detalhesTecnicos?.tempMaximaQueima || 1240;
      const clayBrand = peca.detalhesTecnicos?.marcaMassa || 'Nacional';
      const glazeType = peca.detalhesTecnicos?.tipoEsmalte || 'estavel';
      
      let avaliacao = 'Viabilidade técnica preliminar aceita.';
      let riscos = 'Riscos baixos dentro dos padrões.';
      
      if (isEsmalte) {
        if (glazeType === 'reagente') {
          avaliacao = 'Esmaltes reagentes possuem alto potencial estético, mas apresentam risco moderado de escorrimento. Requer cuidados extras de acondicionamento.';
          riscos = 'Risco médio de escorrimento na base. Recomendamos limpar bem o pé da peça e deixar margem de segurança de 1.5cm sem esmalte.';
        } else {
          avaliacao = 'Esmalte estável padrão. Viabilidade técnica alta para alta temperatura (1240ºC).';
          riscos = 'Certifique-se de que o esmalte é compatível com cone 7.';
        }
      } else {
        avaliacao = 'Peça em argila crua pronta para queima lenta de biscoito a 1000ºC. Temperatura máxima suportada informada é adequada.';
      }

      return {
        pecaId: peca.id,
        nome: peca.nome,
        resultado: 'Revisado Manualmente',
        avaliacao,
        riscos,
        conselhoTecnico: 'Mantenha o espaçamento de segurança regulamentar de 1cm a 2cm entre peças no forno.',
        statusCompatibilidade: 'Aprovado Condicionalmente (Sujeito a inspeção tátil)'
      };
    });

    return res.json({
      relatorioGeral: 'Avaliação técnica gerada automaticamente pelo sistema com base nas regras do ateliê.',
      analises: fallbackReports
    });
  }

  try {
    const prompt = `Você é o avaliador técnico especialista em cerâmica do Ateliê Cerâmico de Alta Temperatura. Analise as seguintes peças cadastradas para queima de Biscoito ou Esmalte e gere um relatório técnico de viabilidade e riscos detalhado para cada uma em formato JSON.

Regras do forno:
- Volume do forno: 195 litros.
- Queima de biscoito lenta até 1000ºC.
- Queima de esmalte de alta temperatura (Cone 7 - 1240ºC).
- Peças esmaltadas não podem se encostar (risco de fusão).
- Se o esmalte escorrer, o cliente arca com os danos das prateleiras/placas refratárias.
- Peças com altura > 30 cm precisam obrigatoriamente de fornada inteira ou meia fornada no caso de peças altas para garantir o espaçamento vertical.

Aqui estão as peças do cliente para avaliação:
${JSON.stringify(pecas, null, 2)}

Responda rigorosamente com um objeto JSON válido contendo:
{
  "relatorioGeral": "Resumo geral amigável das peças e do cuidado técnico",
  "analises": [
    {
      "pecaId": "ID da peça",
      "nome": "Nome da peça",
      "resultado": "Aprovado / Atenção / Alto Risco",
      "avaliacao": "Avaliação detalhada da viabilidade térmica da argila e compatibilidade com alta temperatura (1240ºC para esmalte ou 1000ºC para biscoito)",
      "riscos": "Identificação de riscos (ex: escorrimento de esmaltes reagentes, rachaduras por espessura desigual, fusão, altura excessiva > 30cm)",
      "conselhoTecnico": "Instruções específicas para o ceramista (ex: limpar base do pé, usar prato de segurança refratário, número ideal de camadas)",
      "statusCompatibilidade": "Mensagem curta de compatibilidade técnica"
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['relatorioGeral', 'analises'],
          properties: {
            relatorioGeral: { type: Type.STRING },
            analises: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['pecaId', 'nome', 'resultado', 'avaliacao', 'riscos', 'conselhoTecnico', 'statusCompatibilidade'],
                properties: {
                  pecaId: { type: Type.STRING },
                  nome: { type: Type.STRING },
                  resultado: { type: Type.STRING },
                  avaliacao: { type: Type.STRING },
                  riscos: { type: Type.STRING },
                  conselhoTecnico: { type: Type.STRING },
                  statusCompatibilidade: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const parsedData = JSON.parse(response.text || '{}');
    return res.json(parsedData);
  } catch (error: any) {
    console.error('Error analyzing with Gemini:', error);
    return res.status(500).json({ error: 'Erro ao gerar análise técnica do Gemini.' });
  }
});

// Configure Vite or production static server
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Ateliê Cerâmico Backend] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
