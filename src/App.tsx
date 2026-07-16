import React, { useState, useEffect } from 'react';
import { 
  Flame, 
  Trash2, 
  Plus, 
  Copy, 
  FileText, 
  Share2, 
  Mail, 
  Settings, 
  Bell, 
  User, 
  LogOut, 
  LogIn, 
  CheckCircle, 
  AlertTriangle, 
  ShieldAlert, 
  Sparkles, 
  Info,
  Layers,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Users,
  TrendingUp,
  Clock,
  Send,
  PlusCircle,
  HelpCircle
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ReChartsTooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { FiringType, PieceItem, Order, User as UserType, NotificationItem } from './types';
import { KilnOptimizer } from './components/KilnOptimizer';

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'orcamento' | 'historico' | 'admin'>('orcamento');
  
  // Auth states
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authNome, setAuthNome] = useState('');
  const [authError, setAuthError] = useState('');

  // Piece Builder form states
  const [pecaNome, setPecaNome] = useState('Prato Decorativo');
  const [tipoQueima, setTipoQueima] = useState<'biscoito' | 'esmalte' | 'ambas'>('biscoito');
  const [metodoQueima, setMetodoQueima] = useState<string>('ajuste_inteligente');
  const [metodoQueimaEsmalte, setMetodoQueimaEsmalte] = useState<string>('ajuste_inteligente');
  const [altura, setAltura] = useState<number>(8);
  const [largura, setLargura] = useState<number>(15);
  const [profundidade, setProfundidade] = useState<number>(15);
  
  // Technical details for current peca being configured (Optional)
  const [incluirDetalhes, setIncluirDetalhes] = useState<boolean>(false);
  const [nacionalidadeMassa, setNacionalidadeMassa] = useState<string>('Nacional');
  const [marcaMassa, setMarcaMassa] = useState<string>('');
  const [tempMaximaQueima, setTempMaximaQueima] = useState<number>(1250);
  const [tipoEsmalte, setTipoEsmalte] = useState<'reagente' | 'estavel' | 'mate' | 'acetinado' | 'brilho' | ''>('estavel');
  const [marcaEsmalte, setMarcaEsmalte] = useState<string>('');
  const [tempMaximaEsmalte, setTempMaximaEsmalte] = useState<number>(1240);
  const [quantasCamadas, setQuantasCamadas] = useState<number>(2);

  // Set of pieces added to current quote
  const [piecesList, setPiecesList] = useState<PieceItem[]>([]);
  
  // App alerts / state
  const [aceitouDanosEsmalte, setAceitouDanosEsmalte] = useState<boolean>(false);
  const [showNotificationTray, setShowNotificationTray] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [savingOrder, setSavingOrder] = useState<boolean>(false);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

  // Gemini AI Analysis states
  const [isAnalyzingTech, setIsAnalyzingTech] = useState<boolean>(false);
  const [geminiRelatorio, setGeminiRelatorio] = useState<{
    relatorioGeral: string;
    analises: Array<{
      pecaId: string;
      nome: string;
      resultado: string;
      avaliacao: string;
      riscos: string;
      conselhoTecnico: string;
      statusCompatibilidade: string;
    }>;
  } | null>(null);

  // Admin filter & actions state
  const [adminFilterStatus, setAdminFilterStatus] = useState<string>('todos');

  // Load user from localstorage on start
  useEffect(() => {
    const savedUser = localStorage.getItem('atelie_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
  }, []);

  // Fetch orders and notifications when user is set
  useEffect(() => {
    if (currentUser) {
      fetchUserOrdersAndNotifications();
    } else {
      setAllOrders([]);
      setNotifications([]);
    }
  }, [currentUser]);

  const fetchUserOrdersAndNotifications = async () => {
    if (!currentUser) return;
    try {
      // Fetch notifications
      const nRes = await fetch(`/api/notifications?userId=${currentUser.id}`);
      if (nRes.ok) {
        const nData = await nRes.json();
        setNotifications(nData);
      }

      // Fetch orders
      const oRes = await fetch(`/api/orders?userId=${currentUser.id}&isAdmin=${currentUser.isAdmin}`);
      if (oRes.ok) {
        const oData = await oRes.json();
        setAllOrders(oData);
      }
    } catch (e) {
      console.error('Error fetching backend updates:', e);
    }
  };

  // Mark all notifications as read
  const markNotificationsAsRead = async () => {
    if (!currentUser) return;
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      setNotifications(prev => prev.map(n => ({ ...n, lida: true })));
    } catch (e) {
      console.error(e);
    }
  };

  // Helper to automatically determine the best firing method based on piece height
  const resolveSmartMethod = (type: FiringType, h: number): string => {
    if (type === 'biscoito') {
      if (h <= 14.5) {
        return 'compartilhada';
      } else if (h <= 30) {
        return 'meia_fornada';
      } else {
        return 'fornada_inteira';
      }
    } else { // esmalte
      if (h <= 14.5) {
        return 'reserva_prateleira';
      } else if (h <= 30) {
        return 'meia_fornada';
      } else {
        return 'fornada_inteira';
      }
    }
  };

  // Auto-adjust default method and rules when inputs change
  useEffect(() => {
    // Only run manual auto-corrections if NOT in "ajuste_inteligente" mode
    if (metodoQueima !== 'ajuste_inteligente') {
      if (altura > 30) {
        setMetodoQueima('fornada_inteira');
      } else if (altura > 14.5) {
        if (tipoQueima === 'biscoito' && metodoQueima === 'compartilhada') {
          setMetodoQueima('meia_fornada');
        } else if (tipoQueima === 'ambas' && metodoQueima === 'compartilhada') {
          setMetodoQueima('meia_fornada');
        }
      }
    }

    if (metodoQueimaEsmalte !== 'ajuste_inteligente') {
      if (altura > 30) {
        setMetodoQueimaEsmalte('fornada_inteira');
      } else if (altura > 14.5) {
        if (tipoQueima === 'esmalte' && metodoQueimaEsmalte === 'reserva_prateleira') {
          setMetodoQueimaEsmalte('meia_fornada');
        } else if (tipoQueima === 'ambas' && metodoQueimaEsmalte === 'reserva_prateleira') {
          setMetodoQueimaEsmalte('meia_fornada');
        }
      }
    }
  }, [altura, tipoQueima, metodoQueima, metodoQueimaEsmalte]);

  // Calculate price of individual piece based on studio rules
  const calculatePiecePrice = (
    type: FiringType,
    method: string,
    h: number,
    w: number,
    d: number
  ): number => {
    let resolvedMethod = method;
    if (resolvedMethod === 'ajuste_inteligente') {
      resolvedMethod = resolveSmartMethod(type, h);
    }

    const volumeM3 = (h * w * d) / 1000000;
    const handlingFee = 15.00; // Taxa de manuseio e acondicionamento técnico

    if (type === 'biscoito') {
      if (resolvedMethod === 'fornada_inteira' || h > 30) {
        return 300.00;
      }
      if (resolvedMethod === 'meia_fornada') {
        return 180.00;
      }
      // Compartilhada por volume m³
      // R$ 1.500,00 por metro cúbico m3
      const volumeCost = volumeM3 * 1500.00;
      // Garante uma taxa mínima de queima por peça para não dar prejuízo ao ateliê
      const minQueimaVolume = 12.00;
      return Math.max(volumeCost, minQueimaVolume) + handlingFee;
    } else {
      // Esmalte (Alta temperatura, Cone 7 - 1240ºC)
      if (resolvedMethod === 'fornada_inteira' || h > 30) {
        return 450.00;
      }
      if (resolvedMethod === 'meia_fornada' || h > 14.5) {
        return 250.00;
      }
      // Reserva de prateleira (baseado nos níveis práticos de 10cm ou 14.5cm)
      if (h <= 10) {
        return 60.00 + handlingFee; // 5 prateleiras de 10cm
      } else {
        return 80.00 + handlingFee; // 4 prateleiras de 14.5cm
      }
    }
  };

  // Dimension warnings
  const isTooTall = altura > 60;
  const isTooWide = largura > 48 || profundidade > 48;
  const dimensionError = isTooTall 
    ? 'A peça excede a altura útil máxima do forno de 195L (60 cm).' 
    : isTooWide 
    ? 'A peça excede as dimensões horizontais das prateleiras do forno de 195L (48x48 cm).' 
    : null;

  // Add piece to list
  const handleAddPiece = () => {
    if (dimensionError) return;

    const volumeM3 = (altura * largura * profundidade) / 1000000;

    if (tipoQueima === 'ambas') {
      const finalBiscoitoMethod = metodoQueima === 'ajuste_inteligente' ? resolveSmartMethod('biscoito', altura) : metodoQueima;
      const custoBiscoito = calculatePiecePrice('biscoito', finalBiscoitoMethod, altura, largura, profundidade);
      const pieceBiscoito: PieceItem = {
        id: 'p-' + Date.now() + '-b',
        nome: `${pecaNome.trim() || 'Peça'} (Biscoito)`,
        tipo: 'biscoito',
        metodo: finalBiscoitoMethod as any,
        altura,
        largura,
        profundidade,
        volumeM3,
        custoCalculado: custoBiscoito,
        incluirDetalhes,
        detalhesTecnicos: incluirDetalhes ? {
          nacionalidadeMassa,
          marcaMassa: marcaMassa.trim() || 'Não informada',
          tempMaximaQueima,
        } : undefined
      };

      const finalEsmalteMethod = metodoQueimaEsmalte === 'ajuste_inteligente' ? resolveSmartMethod('esmalte', altura) : metodoQueimaEsmalte;
      const custoEsmalte = calculatePiecePrice('esmalte', finalEsmalteMethod, altura, largura, profundidade);
      const pieceEsmalte: PieceItem = {
        id: 'p-' + Date.now() + '-e',
        nome: `${pecaNome.trim() || 'Peça'} (Esmalte)`,
        tipo: 'esmalte',
        metodo: finalEsmalteMethod as any,
        altura,
        largura,
        profundidade,
        volumeM3,
        custoCalculado: custoEsmalte,
        incluirDetalhes,
        detalhesTecnicos: incluirDetalhes ? {
          nacionalidadeMassa,
          marcaMassa: marcaMassa.trim() || 'Não informada',
          tempMaximaQueima,
          tipoEsmalte,
          marcaEsmalte: marcaEsmalte.trim() || 'Estúdio',
          tempMaximaEsmalte,
          quantasCamadas
        } : undefined
      };

      setPiecesList([...piecesList, pieceBiscoito, pieceEsmalte]);
    } else {
      const activeMethod = tipoQueima === 'esmalte' ? metodoQueimaEsmalte : metodoQueima;
      const finalMethod = activeMethod === 'ajuste_inteligente' ? resolveSmartMethod(tipoQueima, altura) : activeMethod;
      const custo = calculatePiecePrice(tipoQueima, finalMethod, altura, largura, profundidade);

      const newPiece: PieceItem = {
        id: 'p-' + Date.now(),
        nome: pecaNome.trim() || `Peça #${piecesList.length + 1}`,
        tipo: tipoQueima,
        metodo: finalMethod as any,
        altura,
        largura,
        profundidade,
        volumeM3,
        custoCalculado: custo,
        incluirDetalhes,
        detalhesTecnicos: incluirDetalhes ? {
          nacionalidadeMassa,
          marcaMassa: marcaMassa.trim() || 'Não informada',
          tempMaximaQueima,
          ...(tipoQueima === 'esmalte' ? {
            tipoEsmalte,
            marcaEsmalte: marcaEsmalte.trim() || 'Estúdio',
            tempMaximaEsmalte,
            quantasCamadas
          } : {})
        } : undefined
      };

      setPiecesList([...piecesList, newPiece]);
    }

    setGeminiRelatorio(null); // Reset report since list has changed
    
    // Reset form for next piece with defaults
    setPecaNome('Vaso ou Prato');
    setIncluirDetalhes(false);
    setMarcaMassa('');
    setMarcaEsmalte('');
  };

  // Remove piece
  const handleRemovePiece = (id: string) => {
    setPiecesList(piecesList.filter(p => p.id !== id));
    setGeminiRelatorio(null);
  };

  // Total calculation for the whole quote
  const totalOrcamento = piecesList.reduce((acc, curr) => acc + curr.custoCalculado, 0);

  // Copy Quote & WhatsApp share text
  const generateMessageText = (): string => {
    let msg = `*ORÇAMENTO DE QUEIMA - OLLARIA ATELIE QUEIMA ALTA TEMPERATURA*\n`;
    msg += `--------------------------------------------------\n`;
    msg += `*Especificação do Forno:* 195 Litros | Cone 7 (1240ºC)\n\n`;
    
    piecesList.forEach((p, idx) => {
      const tipoLabel = p.tipo === 'biscoito' ? 'Queima de Biscoito (1000ºC)' : 'Queima de Esmalte (1240ºC)';
      const metodoLabel = p.metodo === 'compartilhada' ? 'Compartilhada (m³)' : 
                          p.metodo === 'reserva_prateleira' ? 'Reserva de Prateleira' :
                          p.metodo === 'meia_fornada' ? 'Meia Fornada' : 'Fornada Inteira';

      msg += `*${idx + 1}. ${p.nome}*\n`;
      msg += `  • Tipo: ${tipoLabel}\n`;
      msg += `  • Modalidade: ${metodoLabel}\n`;
      msg += `  • Medidas: ${p.altura}x${p.largura}x${p.profundidade} cm (A x L x P)\n`;
      msg += `  • Volume: ${(p.volumeM3 * 1000).toFixed(3)}L / ${p.volumeM3.toFixed(6)} m³\n`;
      msg += `  • Custo Unitário: R$ ${p.custoCalculado.toFixed(2)}\n`;

      if (p.detalhesTecnicos) {
        msg += `  • _Info Técnica:_ Argila ${p.detalhesTecnicos.nacionalidadeMassa} (${p.detalhesTecnicos.marcaMassa}), Temp Máx: ${p.detalhesTecnicos.tempMaximaQueima}ºC\n`;
        if (p.tipo === 'esmalte') {
          msg += `    Esmalte: ${p.detalhesTecnicos.tipoEsmalte} (${p.detalhesTecnicos.marcaEsmalte}), ${p.detalhesTecnicos.quantasCamadas} camadas, Temp Máx: ${p.detalhesTecnicos.tempMaximaEsmalte}ºC\n`;
        }
      }
      msg += `\n`;
    });

    msg += `--------------------------------------------------\n`;
    msg += `*Total Estimado:* R$ ${totalOrcamento.toFixed(2)}\n\n`;
    msg += `_Observações Importantes:_\n`;
    msg += `⚠️ Na queima de esmalte, o espaçamento de segurança é indispensável.\n`;
    msg += `⚠️ Danos provocados por esmalte escorrido às placas e prateleiras são de responsabilidade financeira do ceramista.\n`;
    
    return msg;
  };

  const handleCopyClipboard = () => {
    const text = generateMessageText();
    navigator.clipboard.writeText(text);
    setCopiedMessage('Orçamento copiado para a área de transferência!');
    setTimeout(() => setCopiedMessage(null), 3000);
  };

  const handleSendWhatsApp = () => {
    const text = encodeURIComponent(generateMessageText());
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleSendEmail = () => {
    const cleanText = generateMessageText().replace(/\*/g, ''); // strip asterisks for cleaner email rendering
    const subject = encodeURIComponent('Orçamento de Queima - Ollaria Ateliê');
    const body = encodeURIComponent(cleanText);
    window.open(`mailto:ollariaatelie@gmail.com?subject=${subject}&body=${body}`, '_blank');
  };

  // Client-side PDF Generation with jsPDF
  const handleGeneratePDF = () => {
    try {
      const doc = new jsPDF();
      
      // Theme colors for PDF
      const terracottaColor = '#C15E3F';
      const charcoalColor = '#4A443F';
      
      // Header
      doc.setFillColor(242, 239, 233); // Light gray-beige (#F2EFE9)
      doc.rect(0, 0, 210, 40, 'F');
      
      doc.setTextColor(74, 68, 63); // Charcoal
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('ATELIE CERAMICO', 15, 18);
      
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(12);
      doc.setTextColor(193, 94, 63); // Terracotta
      doc.text('Calculadora Profissional de Queima & Orcamentos', 15, 26);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(138, 132, 124);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 15, 34);
      
      // Forno specifications box
      doc.setDrawColor(226, 222, 208);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(15, 48, 180, 20, 3, 3, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(74, 68, 63);
      doc.text('ESPECIFICACOES DO FORNO', 20, 54);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Capacidade: 195 Litros | Temperatura Maxima: Alta Temperatura (1240oC - Cone 7) | Queima de Biscoito: 1000oC', 20, 61);

      // Pieces list
      let y = 78;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(74, 68, 63);
      doc.text('ITENS DO ORCAMENTO', 15, y);
      y += 8;

      piecesList.forEach((p, idx) => {
        if (y > 250) {
          doc.addPage();
          y = 20;
        }

        // Draw card background
        doc.setFillColor(253, 247, 245);
        doc.roundedRect(15, y, 180, p.detalhesTecnicos ? 38 : 24, 2, 2, 'F');
        doc.setDrawColor(226, 222, 208);
        doc.roundedRect(15, y, 180, p.detalhesTecnicos ? 38 : 24, 2, 2, 'D');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(193, 94, 63);
        doc.text(`${idx + 1}. ${p.nome}`, 20, y + 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(45, 45, 45);
        
        const tipoLabel = p.tipo === 'biscoito' ? 'Queima de Biscoito (1000oC)' : 'Queima de Esmalte (Alta Temp - 1240oC)';
        const metodoLabel = p.metodo === 'compartilhada' ? 'Compartilhada (por volume)' : 
                            p.metodo === 'reserva_prateleira' ? 'Reserva de Prateleira' :
                            p.metodo === 'meia_fornada' ? 'Meia Fornada' : 'Fornada Inteira';

        doc.text(`Tipo de Queima: ${tipoLabel} | Modalidade: ${metodoLabel}`, 20, y + 12);
        doc.text(`Dimensoes: ${p.altura} x ${p.largura} x ${p.profundidade} cm | Volume: ${(p.volumeM3 * 1000).toFixed(2)} Litros`, 20, y + 17);

        // Price on the right
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(74, 68, 63);
        doc.text(`R$ ${p.custoCalculado.toFixed(2)}`, 165, y + 12);

        if (p.detalhesTecnicos) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8.5);
          doc.setTextColor(138, 132, 124);
          let techStr = `Argila: ${p.detalhesTecnicos.nacionalidadeMassa} (${p.detalhesTecnicos.marcaMassa}) | Temp Max Argila: ${p.detalhesTecnicos.tempMaximaQueima}oC`;
          if (p.tipo === 'esmalte') {
            techStr += `\nEsmalte: ${p.detalhesTecnicos.tipoEsmalte} (${p.detalhesTecnicos.marcaEsmalte}) | Camadas: ${p.detalhesTecnicos.quantasCamadas} | Temp Max: ${p.detalhesTecnicos.tempMaximaEsmalte}oC`;
          }
          doc.text(techStr, 20, y + 24);
        }

        y += p.detalhesTecnicos ? 44 : 30;
      });

      // Total and Terms box
      if (y > 220) {
        doc.addPage();
        y = 20;
      }

      doc.setDrawColor(193, 94, 63);
      doc.setLineWidth(0.5);
      doc.line(15, y, 195, y);
      y += 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(74, 68, 63);
      doc.text('VALOR TOTAL ESTIMADO:', 15, y);
      
      doc.setFontSize(16);
      doc.setTextColor(193, 94, 63);
      doc.text(`R$ ${totalOrcamento.toFixed(2)}`, 155, y);
      y += 12;

      // Importante Rules block
      doc.setFillColor(249, 248, 246);
      doc.rect(15, y, 180, 42, 'F');
      doc.setDrawColor(226, 222, 208);
      doc.rect(15, y, 180, 42, 'D');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(193, 94, 63);
      doc.text('OBSERVACOES E TERMOS DE SEGURANCA TECNICA:', 20, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(74, 68, 63);
      const terms = [
        '- As medidas consideradas sao sempre as dimensoes maximas da peca, incluindo alcas, bicos, pes e salienias.',
        '- O acondicionamento das pecas no forno e de responsabilidade tecnica exclusiva do atelie cerâmico.',
        '- Na queima de esmalte, o espacamento de seguranâa regulamentar entre as pecas e indispensavel para evitar fusao.',
        '- Caso o esmalte escorra e provoque danos as prateleiras, placas ou suportes, o ceramista devera arcar com os custos de reparo.',
        '- Peças destinadas à queima de esmalte passam por avaliação técnica de viabilidade e compatibilidade de temperatura.'
      ];
      
      terms.forEach((term, i) => {
        doc.text(term, 20, y + 13 + (i * 5.5));
      });

      doc.save(`orcamento-atelie-cerâmico.pdf`);
    } catch (e) {
      console.error('Error generating PDF:', e);
      alert('Houve um erro ao gerar o PDF. Verifique se as informações inseridas estão corretas.');
    }
  };

  // Call Gemini API on the server to analyze the pieces technically
  const handleGeminiAnalysis = async () => {
    if (piecesList.length === 0) return;
    setIsAnalyzingTech(true);
    setGeminiRelatorio(null);

    try {
      const response = await fetch('/api/gemini/analyze-technical', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pecas: piecesList })
      });

      if (response.ok) {
        const data = await response.json();
        setGeminiRelatorio(data);
      } else {
        const err = await response.json();
        alert(err.error || 'Erro na avaliação técnica do Gemini.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao se conectar ao servidor para gerar a avaliação técnica.');
    } finally {
      setIsAnalyzingTech(false);
    }
  };

  // Auth Submit handler
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = authMode === 'login' 
        ? { email: authEmail, senha: authPassword }
        : { nome: authNome, email: authEmail, senha: authPassword };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (res.ok) {
        setCurrentUser(data.user);
        localStorage.setItem('atelie_user', JSON.stringify(data.user));
        setShowAuthModal(false);
        setAuthPassword('');
        setAuthEmail('');
        setAuthNome('');
      } else {
        setAuthError(data.error || 'Erro ao autenticar.');
      }
    } catch (err) {
      setAuthError('Erro na conexão com o servidor.');
    }
  };

  // Log out
  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('atelie_user');
    setActiveTab('orcamento');
  };

  // Save order to the cloud
  const handleSaveOrderToCloud = async () => {
    if (!currentUser) {
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }

    if (piecesList.length === 0) {
      alert('Adicione pelo menos uma peça para salvar o orçamento.');
      return;
    }

    if (!aceitouDanosEsmalte && piecesList.some(p => p.tipo === 'esmalte')) {
      alert('Você precisa aceitar os termos de responsabilidade técnica de esmalte antes de enviar.');
      return;
    }

    setSavingOrder(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: currentUser.id,
          clienteNome: currentUser.nome,
          clienteEmail: currentUser.email,
          pecas: piecesList,
          total: totalOrcamento
        })
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        setPiecesList([]); // Clear current workspace list
        setGeminiRelatorio(null);
        setAceitouDanosEsmalte(false);
        fetchUserOrdersAndNotifications(); // Refresh history
        setActiveTab('historico'); // Redirect to order list
      } else {
        alert(data.error || 'Erro ao salvar orçamento.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao conectar ao servidor.');
    } finally {
      setSavingOrder(false);
    }
  };

  // Admin: Update order status
  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (res.ok) {
        fetchUserOrdersAndNotifications(); // Refresh
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao atualizar status.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Stats calculation for Admin Dashboard
  const adminStats = (() => {
    const totalRevenue = allOrders
      .filter(o => o.status !== 'cancelado')
      .reduce((sum, o) => sum + o.total, 0);
    
    const countPendente = allOrders.filter(o => o.status === 'pendente').length;
    const countQueimando = allOrders.filter(o => o.status === 'queimando').length;
    const countConcluido = allOrders.filter(o => o.status === 'concluido').length;
    
    // Status distribution chart data
    const statusData = [
      { name: 'Pendentes', value: countPendente, fill: '#E6B89C' },
      { name: 'Em Análise', value: allOrders.filter(o => o.status === 'em_analise').length, fill: '#D3A297' },
      { name: 'Aprovados', value: allOrders.filter(o => o.status === 'aprovado').length, fill: '#A8C3A0' },
      { name: 'No Forno', value: countQueimando, fill: '#C15E3F' },
      { name: 'Concluídos', value: countConcluido, fill: '#4A443F' },
    ];

    return { totalRevenue, countPendente, countQueimando, countConcluido, statusData };
  })();

  // Filter orders for admin list
  const filteredOrders = allOrders.filter(o => {
    if (adminFilterStatus === 'todos') return true;
    return o.status === adminFilterStatus;
  });

  return (
    <div className="flex flex-col min-h-screen bg-[#F9F8F6] text-[#2D2D2D] font-sans antialiased">
      {/* Header Navigation */}
      <header className="h-16 border-b border-[#E2DED0] px-4 md:px-8 flex items-center justify-between bg-white shrink-0 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#C15E3F] rounded-full flex items-center justify-center text-white font-bold shadow-md shadow-[#C15E3F]/20">
            <Flame className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-bold tracking-tight text-[#4A443F] flex items-center gap-1.5">
              Ollaria atelie <span className="text-[#C15E3F] italic font-normal text-sm md:text-base">Queima Alta Temperatura</span>
            </h1>
            <p className="text-[10px] text-[#8A847C] hidden sm:block">FORNO COMPOSTO DE 195 LITROS • CONE 7 (1240ºC)</p>
          </div>
        </div>

        {/* Desktop and Tablet Menu */}
        <div className="flex items-center gap-4 md:gap-6">
          <div className="flex gap-4 md:gap-6 text-xs md:text-sm font-semibold uppercase tracking-widest text-[#8A847C]">
            <button 
              onClick={() => setActiveTab('orcamento')}
              className={`pb-1 border-b-2 transition-all cursor-pointer ${activeTab === 'orcamento' ? 'text-[#C15E3F] border-[#C15E3F]' : 'border-transparent hover:text-[#4A443F]'}`}
              id="tab-orcamento"
            >
              Orçamento
            </button>
            <button 
              onClick={() => {
                if (!currentUser) {
                  setAuthMode('login');
                  setShowAuthModal(true);
                } else {
                  setActiveTab('historico');
                }
              }}
              className={`pb-1 border-b-2 transition-all cursor-pointer ${activeTab === 'historico' ? 'text-[#C15E3F] border-[#C15E3F]' : 'border-transparent hover:text-[#4A443F]'}`}
              id="tab-historico"
            >
              Meus Pedidos
            </button>
            {currentUser?.isAdmin && (
              <button 
                onClick={() => setActiveTab('admin')}
                className={`pb-1 border-b-2 transition-all cursor-pointer ${activeTab === 'admin' ? 'text-[#C15E3F] border-[#C15E3F]' : 'border-transparent hover:text-[#4A443F]'}`}
                id="tab-admin"
              >
                Painel Admin
              </button>
            )}
          </div>

          <div className="h-6 w-[1px] bg-[#E2DED0] hidden xs:block"></div>

          {/* User Section & Notifications */}
          <div className="flex items-center gap-2 xs:gap-3">
            {currentUser ? (
              <>
                {/* Notification Bell */}
                <div className="relative">
                  <button 
                    onClick={() => {
                      setShowNotificationTray(!showNotificationTray);
                      if (!showNotificationTray) {
                        markNotificationsAsRead();
                      }
                    }}
                    className="p-1.5 text-[#4A443F] hover:bg-[#F2EFE9] rounded-full relative cursor-pointer"
                    id="btn-notifications"
                  >
                    <Bell className="w-5 h-5" />
                    {notifications.some(n => !n.lida) && (
                      <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#C15E3F] rounded-full ring-2 ring-white"></span>
                    )}
                  </button>

                  {/* Notification Tray Dropdown */}
                  {showNotificationTray && (
                    <div className="absolute right-0 mt-2 w-80 bg-white border border-[#E2DED0] rounded-xl shadow-xl z-50 p-4 max-h-[400px] overflow-y-auto">
                      <div className="flex justify-between items-center pb-2 border-b border-[#F2EFE9] mb-2">
                        <h3 className="font-bold text-xs uppercase tracking-wider text-[#4A443F]">Notificações</h3>
                        <span className="text-[10px] bg-[#F2EFE9] px-2 py-0.5 rounded text-[#8A847C]">
                          {notifications.filter(n => !n.lida).length} novas
                        </span>
                      </div>
                      <div className="space-y-3 pt-1">
                        {notifications.length === 0 ? (
                          <p className="text-xs text-center text-[#8A847C] py-4">Nenhuma notificação por enquanto.</p>
                        ) : (
                          notifications.map(n => (
                            <div key={n.id} className={`p-2.5 rounded-lg text-xs transition-colors ${n.lida ? 'bg-white' : 'bg-[#FDF7F5] border-l-2 border-[#C15E3F]'}`}>
                              <div className="flex justify-between items-start mb-1">
                                <span className="font-bold text-[#4A443F]">{n.titulo}</span>
                                <span className="text-[9px] text-[#8A847C]">{new Date(n.data).toLocaleDateString('pt-BR')}</span>
                              </div>
                              <p className="text-[#2D2D2D] leading-relaxed text-[11px]">{n.mensagem}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="hidden md:flex flex-col items-end text-right">
                  <span className="text-xs font-bold text-[#4A443F]">{currentUser.nome}</span>
                  <span className="text-[10px] text-[#8A847C]">{currentUser.isAdmin ? 'Administrador' : 'Ceramista'}</span>
                </div>

                <button 
                  onClick={handleLogout}
                  className="p-1.5 hover:bg-red-50 text-red-600 rounded-full cursor-pointer transition-colors"
                  title="Sair"
                  id="btn-logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <button 
                onClick={() => {
                  setAuthMode('login');
                  setShowAuthModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4A443F] text-white rounded-lg text-xs font-bold hover:bg-[#3d3732] transition-colors cursor-pointer"
                id="btn-login-trigger"
              >
                <LogIn className="w-3.5 h-3.5" />
                Entrar / Cadastrar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden max-w-7xl mx-auto w-full">
        
        {/* TAB 1: ORÇAMENTO / CALCULADORA */}
        {activeTab === 'orcamento' && (
          <>
            {/* Left: Input Panel */}
            <section className="flex-1 lg:max-w-[650px] border-r border-[#E2DED0] p-4 sm:p-6 md:p-8 flex flex-col gap-6 bg-white overflow-y-auto">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="px-2.5 py-1 bg-[#4A443F] text-white text-[10px] rounded uppercase font-extrabold tracking-wider">
                    PARÂMETROS DA PEÇA
                  </span>
                </div>
                <h2 className="text-xl font-bold text-[#4A443F] tracking-tight mb-1">Configurar Nova Peça</h2>
                <p className="text-xs text-[#8A847C]">Insira as dimensões exatas de fabricação (incluindo alças, bicos, pés e saliências).</p>
              </div>

              {/* Step 1: Name and Firing Type Selection */}
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold uppercase text-[#8A847C] block mb-1.5">Identificação / Nome da Peça</label>
                  <input 
                    type="text" 
                    value={pecaNome}
                    onChange={(e) => setPecaNome(e.target.value)}
                    placeholder="Ex: Vaso Cônico, Prato de Sobremesa, Caneca"
                    className="w-full p-2.5 bg-[#FDFDFD] border border-[#E2DED0] rounded-xl text-sm focus:border-[#C15E3F] focus:ring-1 focus:ring-[#C15E3F] outline-none"
                    id="input-piece-name"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button 
                    onClick={() => {
                      setTipoQueima('biscoito');
                      setMetodoQueima('ajuste_inteligente');
                    }}
                    className={`flex flex-col p-4 rounded-xl text-left transition-all border-2 cursor-pointer ${tipoQueima === 'biscoito' ? 'border-[#C15E3F] bg-[#FDF7F5] shadow-sm' : 'border-[#E2DED0] bg-white hover:border-[#8A847C]'}`}
                    id="btn-select-biscoito"
                  >
                    <div className="flex justify-between items-center w-full mb-1">
                      <span className={`text-[10px] uppercase font-bold ${tipoQueima === 'biscoito' ? 'text-[#C15E3F]' : 'text-[#8A847C]'}`}>Opção 01</span>
                      <Flame className={`w-3.5 h-3.5 ${tipoQueima === 'biscoito' ? 'text-[#C15E3F]' : 'text-[#8A847C]'}`} />
                    </div>
                    <span className="text-sm font-bold text-[#4A443F]">Queima de Biscoito</span>
                    <span className="text-[11px] text-[#8A847C] mt-1 leading-relaxed">Lenta até 1000ºC. Por volume ou fornada.</span>
                  </button>

                  <button 
                    onClick={() => {
                      setTipoQueima('esmalte');
                      setMetodoQueimaEsmalte('ajuste_inteligente');
                    }}
                    className={`flex flex-col p-4 rounded-xl text-left transition-all border-2 cursor-pointer ${tipoQueima === 'esmalte' ? 'border-[#C15E3F] bg-[#FDF7F5] shadow-sm' : 'border-[#E2DED0] bg-white hover:border-[#8A847C]'}`}
                    id="btn-select-esmalte"
                  >
                    <div className="flex justify-between items-center w-full mb-1">
                      <span className={`text-[10px] uppercase font-bold ${tipoQueima === 'esmalte' ? 'text-[#C15E3F]' : 'text-[#8A847C]'}`}>Opção 02</span>
                      <Sparkles className={`w-3.5 h-3.5 ${tipoQueima === 'esmalte' ? 'text-[#C15E3F]' : 'text-[#8A847C]'}`} />
                    </div>
                    <span className="text-sm font-bold text-[#4A443F]">Queima de Esmalte</span>
                    <span className="text-[11px] text-[#8A847C] mt-1 leading-relaxed">Alta Temp (1240ºC). Requer prateleira ou fornada.</span>
                  </button>

                  <button 
                    onClick={() => {
                      setTipoQueima('ambas');
                      setMetodoQueima('ajuste_inteligente');
                      setMetodoQueimaEsmalte('ajuste_inteligente');
                    }}
                    className={`flex flex-col p-4 rounded-xl text-left transition-all border-2 cursor-pointer ${tipoQueima === 'ambas' ? 'border-[#C15E3F] bg-[#FDF7F5] shadow-sm' : 'border-[#E2DED0] bg-white hover:border-[#8A847C]'}`}
                    id="btn-select-ambas"
                  >
                    <div className="flex justify-between items-center w-full mb-1">
                      <span className={`text-[10px] uppercase font-bold ${tipoQueima === 'ambas' ? 'text-[#C15E3F]' : 'text-[#8A847C]'}`}>Opção 03</span>
                      <div className="flex gap-0.5">
                        <Flame className={`w-3.5 h-3.5 ${tipoQueima === 'ambas' ? 'text-[#C15E3F]' : 'text-[#8A847C]'}`} />
                        <Sparkles className={`w-3.5 h-3.5 ${tipoQueima === 'ambas' ? 'text-[#C15E3F]' : 'text-[#8A847C]'}`} />
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[#4A443F]">Biscoito + Esmalte</span>
                    <span className="text-[11px] text-[#8A847C] mt-1 leading-relaxed">Cadastra ambas de uma vez. Soma os preços ao final.</span>
                  </button>
                </div>
              </div>

              {/* Step 2: Method and Dimensions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] font-bold uppercase text-[#8A847C] block mb-1.5">Modalidade de Queima</label>
                    {tipoQueima === 'ambas' ? (
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[10px] font-bold text-[#8A847C] block mb-1">Método Biscoito</label>
                          <select 
                            value={metodoQueima}
                            onChange={(e) => setMetodoQueima(e.target.value)}
                            className="w-full p-2 bg-white border border-[#E2DED0] rounded-xl text-xs outline-none focus:border-[#C15E3F]"
                            id="select-firing-method-biscoito"
                          >
                            <option value="ajuste_inteligente">✨ Ajuste Inteligente</option>
                            <option value="compartilhada">Compartilhada (m³)</option>
                            <option value="meia_fornada">Meia Fornada</option>
                            <option value="fornada_inteira">Fornada Inteira</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#8A847C] block mb-1">Método Esmalte</label>
                          <select 
                            value={metodoQueimaEsmalte}
                            onChange={(e) => setMetodoQueimaEsmalte(e.target.value)}
                            className="w-full p-2 bg-white border border-[#E2DED0] rounded-xl text-xs outline-none focus:border-[#C15E3F]"
                            id="select-firing-method-esmalte"
                          >
                            <option value="ajuste_inteligente">✨ Ajuste Inteligente</option>
                            <option value="reserva_prateleira">Reserva Prateleira</option>
                            <option value="meia_fornada">Meia Fornada</option>
                            <option value="fornada_inteira">Fornada Inteira</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <select 
                        value={tipoQueima === 'esmalte' ? metodoQueimaEsmalte : metodoQueima}
                        onChange={(e) => {
                          if (tipoQueima === 'esmalte') {
                            setMetodoQueimaEsmalte(e.target.value);
                          } else {
                            setMetodoQueima(e.target.value);
                          }
                        }}
                        className="w-full p-2.5 bg-white border border-[#E2DED0] rounded-xl text-sm outline-none focus:border-[#C15E3F]"
                        id="select-firing-method"
                      >
                        {tipoQueima === 'biscoito' ? (
                          <>
                            <option value="ajuste_inteligente">✨ Ajuste Inteligente (Automático)</option>
                            <option value="compartilhada">Compartilhada (Por Volume m³)</option>
                            <option value="meia_fornada">Meia Fornada (Até 30 cm de altura)</option>
                            <option value="fornada_inteira">Fornada Inteira</option>
                          </>
                        ) : (
                          <>
                            <option value="ajuste_inteligente">✨ Ajuste Inteligente (Automático)</option>
                            <option value="reserva_prateleira">Reserva de Prateleira Inteira</option>
                            <option value="meia_fornada">Meia Fornada (Até 30 cm de altura)</option>
                            <option value="fornada_inteira">Fornada Inteira</option>
                          </>
                        )}
                      </select>
                    )}

                    {/* Visual indicator of Smart Adjustment resolution */}
                    {((tipoQueima === 'biscoito' || tipoQueima === 'ambas') && metodoQueima === 'ajuste_inteligente') ||
                     ((tipoQueima === 'esmalte' || tipoQueima === 'ambas') && metodoQueimaEsmalte === 'ajuste_inteligente') ? (
                      <div className="mt-2.5 p-3 bg-gradient-to-br from-[#FDF7F5] to-[#F2EFE9] border border-[#C15E3F]/25 rounded-xl text-xs space-y-1.5 shadow-sm">
                        <div className="flex items-center gap-1.5 text-[#C15E3F] font-bold">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Ajuste Inteligente Ativo</span>
                        </div>
                        <p className="text-[#8A847C] text-[11px] leading-relaxed">
                          O sistema organizará as peças automaticamente nas prateleiras buscando o melhor aproveitamento e o menor preço possível.
                        </p>
                        <div className="grid grid-cols-1 gap-1.5 pt-1 border-t border-[#E2DED0]/50 text-[11px]">
                          {(tipoQueima === 'biscoito' || tipoQueima === 'ambas') && metodoQueima === 'ajuste_inteligente' && (
                            <div className="flex justify-between items-center bg-white/70 px-2 py-1 rounded">
                              <span className="text-[#8A847C]">Biscoito ({altura}cm):</span>
                              <span className="font-bold text-[#4A443F] uppercase">
                                {resolveSmartMethod('biscoito', altura) === 'compartilhada' ? 'Queima Compartilhada (m³)' : 
                                 resolveSmartMethod('biscoito', altura) === 'meia_fornada' ? 'Meia Fornada' : 'Fornada Inteira'}
                              </span>
                            </div>
                          )}
                          {(tipoQueima === 'esmalte' || tipoQueima === 'ambas') && metodoQueimaEsmalte === 'ajuste_inteligente' && (
                            <div className="flex justify-between items-center bg-white/70 px-2 py-1 rounded">
                              <span className="text-[#8A847C]">Esmalte ({altura}cm):</span>
                              <span className="font-bold text-[#4A443F] uppercase">
                                {resolveSmartMethod('esmalte', altura) === 'reserva_prateleira' ? (altura <= 10 ? 'Prateleira 50x10cm' : 'Prateleira 50x14.5cm') : 
                                 resolveSmartMethod('esmalte', altura) === 'meia_fornada' ? 'Meia Fornada' : 'Fornada Inteira'}
                              </span>
                            </div>
                          )}
                          <div className="text-[10px] text-[#8A847C] italic leading-tight pt-1">
                            {tipoQueima === 'esmalte' || tipoQueima === 'ambas' ? (
                              <span className="block">⚠️ Esmalte requer espaçamento de segurança (peças não podem se encostar!).</span>
                            ) : null}
                            {tipoQueima === 'biscoito' || tipoQueima === 'ambas' ? (
                              <span className="block mt-0.5">🟢 Biscoito permite empilhar (otimização de prateleira ativa).</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase text-[#8A847C] block mb-1.5">Dimensões Máximas (cm)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <span className="text-[10px] text-[#8A847C] block text-center font-bold">Altura</span>
                        <input 
                          type="number" 
                          value={altura || ''}
                          onChange={(e) => setAltura(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full p-2 border border-[#E2DED0] rounded-lg text-sm text-center outline-none focus:border-[#C15E3F]"
                          placeholder="cm"
                          min="1"
                          id="input-height"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-[#8A847C] block text-center font-bold">Largura</span>
                        <input 
                          type="number" 
                          value={largura || ''}
                          onChange={(e) => setLargura(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full p-2 border border-[#E2DED0] rounded-lg text-sm text-center outline-none focus:border-[#C15E3F]"
                          placeholder="cm"
                          min="1"
                          id="input-width"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-[#8A847C] block text-center font-bold">Profundidade</span>
                        <input 
                          type="number" 
                          value={profundidade || ''}
                          onChange={(e) => setProfundidade(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full p-2 border border-[#E2DED0] rounded-lg text-sm text-center outline-none focus:border-[#C15E3F]"
                          placeholder="cm"
                          min="1"
                          id="input-depth"
                        />
                      </div>
                    </div>
                    {dimensionError && (
                      <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{dimensionError}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Optional Technical details space */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold uppercase text-[#8A847C] block">Ficha Técnica da Argila/Esmalte</label>
                    <button 
                      onClick={() => setIncluirDetalhes(!incluirDetalhes)}
                      className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold transition-colors cursor-pointer ${incluirDetalhes ? 'bg-[#C15E3F] text-white' : 'bg-[#F2EFE9] text-[#4A443F]'}`}
                      id="btn-toggle-tech-details"
                    >
                      {incluirDetalhes ? 'Ocultar' : 'Habilitar'}
                    </button>
                  </div>

                  <div className={`border border-[#E2DED0] rounded-xl p-3 bg-[#FDFDFD] space-y-3 transition-opacity duration-200 ${incluirDetalhes ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[9px] text-[#8A847C] uppercase font-bold">Origem Argila</span>
                        <select 
                          value={nacionalidadeMassa}
                          onChange={(e) => setNacionalidadeMassa(e.target.value)}
                          className="w-full p-1 bg-transparent border-b border-[#F0EEE8] text-xs outline-none focus:border-[#C15E3F]"
                          id="select-clay-origin"
                        >
                          <option value="Nacional">Nacional</option>
                          <option value="Importada">Importada</option>
                        </select>
                      </div>
                      <div>
                        <span className="text-[9px] text-[#8A847C] uppercase font-bold">Marca Argila</span>
                        <input 
                          type="text" 
                          placeholder="Ex: Pascoal, Cerâmica"
                          value={marcaMassa}
                          onChange={(e) => setMarcaMassa(e.target.value)}
                          className="w-full p-1 bg-transparent border-b border-[#F0EEE8] text-xs outline-none focus:border-[#C15E3F]"
                          id="input-clay-brand"
                        />
                      </div>
                    </div>

                    <div>
                      <span className="text-[9px] text-[#8A847C] uppercase font-bold block mb-0.5">Temp. Máxima da Argila (ºC)</span>
                      <input 
                        type="number" 
                        value={tempMaximaQueima || ''}
                        onChange={(e) => setTempMaximaQueima(parseInt(e.target.value) || 0)}
                        className="w-full p-1 bg-transparent border-b border-[#F0EEE8] text-xs outline-none focus:border-[#C15E3F]"
                        placeholder="Ex: 1300"
                        id="input-clay-temp"
                      />
                    </div>

                    {(tipoQueima === 'esmalte' || tipoQueima === 'ambas') && (
                      <>
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#F0EEE8]">
                          <div>
                            <span className="text-[9px] text-[#8A847C] uppercase font-bold">Tipo Esmalte</span>
                            <select 
                              value={tipoEsmalte}
                              onChange={(e) => setTipoEsmalte(e.target.value as any)}
                              className="w-full p-1 bg-transparent border-b border-[#F0EEE8] text-xs outline-none focus:border-[#C15E3F]"
                              id="select-glaze-type"
                            >
                              <option value="estavel">Estável</option>
                              <option value="reagente">Reagente</option>
                              <option value="mate">Mate</option>
                              <option value="acetinado">Acetinado</option>
                              <option value="brilho">Brilho</option>
                            </select>
                          </div>
                          <div>
                            <span className="text-[9px] text-[#8A847C] uppercase font-bold">Marca Esmalte</span>
                            <input 
                              type="text" 
                              placeholder="Ex: Flavia, Shino"
                              value={marcaEsmalte}
                              onChange={(e) => setMarcaEsmalte(e.target.value)}
                              className="w-full p-1 bg-transparent border-b border-[#F0EEE8] text-xs outline-none focus:border-[#C15E3F]"
                              id="input-glaze-brand"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[9px] text-[#8A847C] uppercase font-bold">Camadas</span>
                            <input 
                              type="number" 
                              value={quantasCamadas || ''}
                              onChange={(e) => setQuantasCamadas(parseInt(e.target.value) || 0)}
                              className="w-full p-1 bg-transparent border-b border-[#F0EEE8] text-xs outline-none"
                              placeholder="Ex: 2"
                              id="input-glaze-coats"
                            />
                          </div>
                          <div>
                            <span className="text-[9px] text-[#8A847C] uppercase font-bold">Temp. Máx Esmalte</span>
                            <input 
                              type="number" 
                              value={tempMaximaEsmalte || ''}
                              onChange={(e) => setTempMaximaEsmalte(parseInt(e.target.value) || 0)}
                              className="w-full p-1 bg-transparent border-b border-[#F0EEE8] text-xs outline-none"
                              placeholder="Ex: 1240"
                              id="input-glaze-temp"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Add Button */}
              <button 
                onClick={handleAddPiece}
                disabled={!!dimensionError || altura <= 0 || largura <= 0 || profundidade <= 0}
                className="w-full py-3 bg-[#C15E3F] text-white rounded-xl font-bold text-sm shadow-md shadow-[#C15E3F]/20 hover:bg-[#a64e32] active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
                id="btn-add-piece"
              >
                <Plus className="w-4 h-4" />
                Adicionar Peça ao Orçamento
              </button>

              {/* Dynamic Warning Boxes based on business logic */}
              <div className="space-y-2">
                {tipoQueima === 'biscoito' && (
                  <div className="p-3 bg-[#FDF7F5] border-l-3 border-[#C15E3F] rounded-r-lg text-[11px] text-[#4A443F] leading-relaxed">
                    <strong>Regras de Biscoito:</strong> Peças altas (acima de 15cm e até 30cm) requerem <strong>Meia Fornada</strong> para acomodação. Peças maiores que 30cm requerem contratação de <strong>Fornada Inteira</strong> obrigatória.
                  </div>
                )}
                {tipoQueima === 'esmalte' && (
                  <div className="p-3 bg-amber-50 border-l-3 border-amber-500 rounded-r-lg text-[11px] text-[#785C3A] leading-relaxed">
                    <strong>Regras de Esmalte (Alta Temp 1240ºC):</strong> Peças esmaltadas nunca podem se encostar para evitar fusão. Cobrança por nível de prateleira (10cm ou 15cm). Alturas entre 15cm e 30cm requerem <strong>Meia Fornada</strong>, e acima de 30cm requerem <strong>Fornada Inteira</strong>.
                  </div>
                )}
              </div>
            </section>

            {/* Right: Summary & Action Panel */}
            <section className="flex-1 p-4 sm:p-6 md:p-8 lg:p-12 flex flex-col justify-between bg-[#F2EFE9] overflow-y-auto">
              <div className="space-y-6">
                
                {/* Visualizer card for current items */}
                <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl shadow-[#4A443F]/5 border border-white relative">
                  <div className="absolute -top-3 -right-3 w-10 h-10 bg-[#C15E3F] rounded-full flex items-center justify-center text-white shadow-md">
                    <Flame className="w-5 h-5" />
                  </div>

                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#8A847C] mb-4">Resumo do Orçamento</h3>

                  {/* List of current pieces */}
                  <div className="space-y-3 mb-6 max-h-[220px] overflow-y-auto pr-1">
                    {piecesList.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-sm font-semibold text-[#8A847C]">Nenhuma peça no orçamento.</p>
                        <p className="text-[11px] text-[#8A847C] mt-1">Configure as dimensões à esquerda e adicione peças.</p>
                      </div>
                    ) : (
                      piecesList.map((p) => (
                        <div key={p.id} className="flex justify-between items-center border-b border-[#F0EEE8] pb-2.5">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-[#4A443F]">{p.nome}</span>
                              <span className="text-[9px] px-1.5 py-0.2 bg-[#F2EFE9] rounded text-[#8A847C] font-semibold uppercase">
                                {p.tipo}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#8A847C]">
                              {p.altura}x{p.largura}x{p.profundidade}cm • {p.metodo.replace('_', ' ')}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono font-bold text-[#4A443F]">
                              R$ {p.custoCalculado.toFixed(2)}
                            </span>
                            <button 
                              onClick={() => handleRemovePiece(p.id)}
                              className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                              title="Remover peça"
                              id={`btn-remove-${p.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Total pricing calculation details */}
                  {piecesList.length > 0 && (
                    <div className="border-t border-[#E2DED0] pt-4 space-y-2">
                      <div className="flex justify-between text-xs text-[#8A847C]">
                        <span>Soma das peças</span>
                        <span className="font-mono">R$ {piecesList.reduce((sum, p) => sum + (p.custoCalculado - 15), 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-[#8A847C]">
                        <span>Taxa de acondicionamento (R$ 15/peça)</span>
                        <span className="font-mono">R$ {(piecesList.length * 15.00).toFixed(2)}</span>
                      </div>
                      
                      <div className="flex justify-between items-end pt-2 border-t border-dashed border-[#E2DED0]">
                        <span className="text-sm font-bold text-[#4A443F]">Total Estimado</span>
                        <div className="text-right">
                          <span className="text-2xl font-bold text-[#C15E3F] block">
                            R$ {totalOrcamento.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* WhatsApp & PDF Export Tools */}
                  {piecesList.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-[#F0EEE8] space-y-3">
                      {/* Runny Glaze acceptance terms for Esmalte */}
                      {piecesList.some(p => p.tipo === 'esmalte') && (
                        <label className="flex items-start gap-2 p-2.5 bg-amber-50/50 border border-amber-200 rounded-lg text-[10px] text-[#785C3A] cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={aceitouDanosEsmalte}
                            onChange={(e) => setAceitouDanosEsmalte(e.target.checked)}
                            className="mt-0.5 rounded text-[#C15E3F] focus:ring-[#C15E3F]"
                            id="checkbox-terms"
                          />
                          <span>
                            Estou ciente de que esmaltes escorridos podem danificar as placas refratárias e concordo em arcar com custos de reparo/substituição caso ocorra.
                          </span>
                        </label>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        <button 
                          onClick={handleSendWhatsApp}
                          className="flex flex-col sm:flex-row items-center justify-center gap-1 py-2 bg-[#25D366] text-white rounded-lg font-bold text-[10px] sm:text-xs shadow-md shadow-[#25D366]/10 hover:bg-[#1ebd57] active:scale-95 transition-all cursor-pointer text-center"
                          id="btn-whatsapp"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </button>
                        <button 
                          onClick={handleSendEmail}
                          className="flex flex-col sm:flex-row items-center justify-center gap-1 py-2 bg-[#C15E3F] text-white rounded-lg font-bold text-[10px] sm:text-xs shadow-md shadow-[#C15E3F]/10 hover:bg-[#a14b30] active:scale-95 transition-all cursor-pointer text-center"
                          id="btn-email"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>E-mail</span>
                        </button>
                        <button 
                          onClick={handleGeneratePDF}
                          className="flex flex-col sm:flex-row items-center justify-center gap-1 py-2 bg-[#4A443F] text-white rounded-lg font-bold text-[10px] sm:text-xs hover:bg-[#3d3732] active:scale-95 transition-all cursor-pointer text-center"
                          id="btn-pdf"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Gerar PDF</span>
                        </button>
                      </div>

                      {/* Gemini Assistant Smart Evaluation tool button */}
                      <button 
                        onClick={handleGeminiAnalysis}
                        disabled={isAnalyzingTech}
                        className="w-full py-2 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 text-purple-700 hover:from-purple-100 hover:to-indigo-100 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                        id="btn-ai-analyze"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                        {isAnalyzingTech ? 'Analisando Compatibilidade...' : 'Consultar Inteligência Artificial (Compatibilidade)'}
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={handleCopyClipboard}
                          className="flex items-center justify-center gap-1.5 py-1.5 border border-[#E2DED0] hover:bg-[#F9F8F6] rounded-lg text-[10px] uppercase font-bold text-[#4A443F] cursor-pointer"
                          id="btn-copy"
                        >
                          <Copy className="w-3 h-3" />
                          Copiar Texto
                        </button>

                        <button 
                          onClick={handleSaveOrderToCloud}
                          disabled={savingOrder}
                          className="flex items-center justify-center gap-1.5 py-1.5 bg-[#C15E3F] text-white hover:bg-[#a64e32] rounded-lg text-[10px] uppercase font-bold cursor-pointer"
                          id="btn-cloud-save"
                        >
                          <FileSpreadsheet className="w-3 h-3" />
                          {savingOrder ? 'Salvando...' : 'Salvar na Nuvem'}
                        </button>
                      </div>

                      {copiedMessage && (
                        <p className="text-center text-xs text-[#25D366] font-semibold">{copiedMessage}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Kiln Shelf Auto-Optimizer Visualizer */}
                <KilnOptimizer piecesList={piecesList} />

                {/* Gemini Technical opinion card when loaded */}
                {geminiRelatorio && (
                  <div className="bg-gradient-to-br from-white to-[#FAF9FF] p-6 rounded-2xl border-2 border-purple-100 shadow-md">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1 bg-purple-100 text-purple-700 rounded-lg">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-xs text-purple-950 uppercase tracking-wider">Laudo de Viabilidade Técnica (IA)</h4>
                    </div>
                    <p className="text-xs text-[#4A443F] leading-relaxed mb-4 italic">
                      "{geminiRelatorio.relatorioGeral}"
                    </p>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {geminiRelatorio.analises.map((an, i) => (
                        <div key={i} className="bg-white p-3 rounded-lg border border-purple-50 text-xs">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="font-bold text-purple-900">{an.nome}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${an.resultado.includes('Aprovado') ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                              {an.resultado}
                            </span>
                          </div>
                          <p className="text-gray-700 mb-1"><strong>Compatibilidade:</strong> {an.avaliacao}</p>
                          <p className="text-red-700 mb-1"><strong>Riscos:</strong> {an.riscos}</p>
                          <p className="text-indigo-950"><strong>Recomendação:</strong> {an.conselhoTecnico}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Information guidelines */}
                <div className="flex flex-col sm:flex-row gap-6 text-[10px] text-[#8A847C] uppercase tracking-wider">
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="font-bold text-[#4A443F] flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-[#C15E3F]" />
                      Acondicionamento Técnico
                    </span>
                    <span>O carregamento do forno, disposição das placas refratárias e controle de rampa é de responsabilidade exclusiva do ateliê.</span>
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="font-bold text-[#4A443F] flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      Danos e Substituição
                    </span>
                    <span>Danos graves causados por fusions ou esmalte escorrendo geram cobrança de taxa de substituição de prateleiras.</span>
                  </div>
                </div>

              </div>
            </section>
          </>
        )}

        {/* TAB 2: MEUS PEDIDOS / HISTÓRICO */}
        {activeTab === 'historico' && (
          <section className="flex-1 p-4 sm:p-6 md:p-8 lg:p-12 bg-white overflow-y-auto w-full">
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-[#4A443F] tracking-tight mb-1">Meus Orçamentos na Nuvem</h2>
                <p className="text-sm text-[#8A847C]">Acompanhe o andamento da queima e o status de aprovação de cada peça de forma segura.</p>
              </div>

              {allOrders.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-[#E2DED0] rounded-2xl bg-[#F9F8F6]">
                  <Flame className="w-12 h-12 text-[#8A847C] mx-auto mb-3 opacity-40" />
                  <p className="text-base font-semibold text-[#4A443F]">Nenhum orçamento salvo na nuvem ainda.</p>
                  <p className="text-xs text-[#8A847C] mt-1 max-w-sm mx-auto">
                    Faça cálculos na calculadora e clique em "Salvar na Nuvem" para armazenar seus dados e receber atualizações em tempo real.
                  </p>
                  <button 
                    onClick={() => setActiveTab('orcamento')}
                    className="mt-4 px-4 py-2 bg-[#C15E3F] text-white rounded-xl text-xs font-bold hover:bg-[#a64e32]"
                  >
                    Ir para Calculadora
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {allOrders.map((order) => (
                    <div key={order.id} className="border border-[#E2DED0] rounded-xl p-4 sm:p-6 bg-[#FDFDFD] shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-[#F2EFE9] mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#4A443F]">Pedido #{order.id}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              order.status === 'concluido' ? 'bg-green-50 text-green-700 border border-green-200' :
                              order.status === 'queimando' ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse' :
                              order.status === 'aprovado' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              order.status === 'em_analise' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {order.status === 'pendente' && 'Aguardando Avaliação'}
                              {order.status === 'em_analise' && 'Em Análise Técnica'}
                              {order.status === 'aprovado' && 'Aprovado'}
                              {order.status === 'queimando' && 'No Forno (Em Queima)'}
                              {order.status === 'concluido' && 'Concluído (Disponível)'}
                              {order.status === 'cancelado' && 'Cancelado'}
                            </span>
                          </div>
                          <span className="text-xs text-[#8A847C]">
                            Criado em: {new Date(order.dataCriacao).toLocaleDateString('pt-BR')} às {new Date(order.dataCriacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-[#8A847C] block">Total</span>
                          <span className="text-lg font-bold text-[#C15E3F] font-mono">R$ {order.total.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Pieces in this order */}
                      <div className="space-y-3">
                        {order.pecas.map((p, idx) => (
                          <div key={idx} className="bg-[#F9F8F6] p-3 rounded-xl border border-[#F0EEE8] text-xs">
                            <div className="flex justify-between items-start mb-1.5">
                              <div>
                                <span className="font-bold text-[#4A443F]">{p.nome}</span>
                                <span className="ml-2 px-1.5 py-0.2 bg-[#E2DED0] text-[#4A443F] rounded text-[9px] uppercase font-bold">
                                  {p.tipo}
                                </span>
                              </div>
                              <span className="font-mono text-[#8A847C]">R$ {p.custoCalculado.toFixed(2)}</span>
                            </div>
                            <p className="text-[#8A847C] text-[11px]">
                              Medidas: {p.altura}x{p.largura}x{p.profundidade}cm • Modalidade: {p.metodo.replace('_', ' ')}
                            </p>
                            {p.detalhesTecnicos && (
                              <div className="mt-2 pt-1.5 border-t border-[#E2DED0] text-[10px] text-[#8A847C] grid grid-cols-2 gap-2">
                                <div>
                                  <strong>Massa:</strong> {p.detalhesTecnicos.marcaMassa} ({p.detalhesTecnicos.nacionalidadeMassa}) | Máx: {p.detalhesTecnicos.tempMaximaQueima}ºC
                                </div>
                                {p.tipo === 'esmalte' && (
                                  <div>
                                    <strong>Esmalte:</strong> {p.detalhesTecnicos.tipoEsmalte} ({p.detalhesTecnicos.marcaEsmalte}) | {p.detalhesTecnicos.quantasCamadas} Camadas
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Export Options inside My Orders */}
                      <div className="mt-4 flex gap-2 justify-end flex-wrap">
                        <button 
                          onClick={() => {
                            // Temporary load list to generate PDF/WhatsApp for this historic order
                            setPiecesList(order.pecas);
                            setTimeout(() => {
                              handleGeneratePDF();
                            }, 100);
                          }}
                          className="px-3 py-1.5 border border-[#E2DED0] hover:bg-[#F9F8F6] text-xs font-bold text-[#4A443F] rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                          id={`btn-order-pdf-${order.id}`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Gerar PDF
                        </button>
                        <button 
                          onClick={() => {
                            setPiecesList(order.pecas);
                            setTimeout(() => {
                              handleSendEmail();
                            }, 100);
                          }}
                          className="px-3 py-1.5 bg-[#C15E3F] text-white hover:bg-[#a14b30] text-xs font-bold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                          id={`btn-order-mail-${order.id}`}
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Enviar E-mail
                        </button>
                        <button 
                          onClick={() => {
                            setPiecesList(order.pecas);
                            setTimeout(() => {
                              handleSendWhatsApp();
                            }, 100);
                          }}
                          className="px-3 py-1.5 bg-[#25D366] text-white hover:bg-[#1ebd57] text-xs font-bold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                          id={`btn-order-wa-${order.id}`}
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          Enviar WhatsApp
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: ADMIN PAINEL DE CONTROLE */}
        {activeTab === 'admin' && currentUser?.isAdmin && (
          <section className="flex-1 p-4 sm:p-6 md:p-8 lg:p-12 bg-white overflow-y-auto w-full">
            <div className="max-w-6xl mx-auto space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-[#4A443F] tracking-tight mb-1">Painel de Controle do Ateliê</h2>
                <p className="text-sm text-[#8A847C]">Gerencie as queimas e envie notificações automáticas sobre o andamento físico de cada peça.</p>
              </div>

              {/* Stats Grid Dashboard */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-[#FDF7F5] border border-orange-100 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-[#8A847C]">Receita Total Estimada</span>
                  <p className="text-2xl font-bold text-[#C15E3F] mt-1 font-mono">R$ {adminStats.totalRevenue.toFixed(2)}</p>
                  <p className="text-[10px] text-[#8A847C] mt-1">Excluindo cancelamentos</p>
                </div>
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-[#8A847C]">Aguardando Análise</span>
                  <p className="text-2xl font-bold text-amber-700 mt-1">{adminStats.countPendente}</p>
                  <p className="text-[10px] text-[#8A847C] mt-1">Apenas pedidos pendentes</p>
                </div>
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-[#8A847C]">Em Queima no Forno</span>
                  <p className="text-2xl font-bold text-red-700 mt-1">{adminStats.countQueimando}</p>
                  <p className="text-[10px] text-[#8A847C] mt-1">Status: Fornando ativo</p>
                </div>
                <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-[#8A847C]">Concluídos e Prontos</span>
                  <p className="text-2xl font-bold text-green-700 mt-1">{adminStats.countConcluido}</p>
                  <p className="text-[10px] text-[#8A847C] mt-1">Disponíveis para retirada</p>
                </div>
              </div>

              {/* Recharts Analytics Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                <div className="bg-[#F9F8F6] p-5 rounded-2xl border border-[#E2DED0]">
                  <h3 className="text-xs font-bold uppercase text-[#4A443F] mb-4">Volume de Pedidos por Status</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={adminStats.statusData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <ReChartsTooltip />
                        <Bar dataKey="value" name="Pedidos">
                          {adminStats.statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#F9F8F6] p-5 rounded-2xl border border-[#E2DED0]">
                  <h3 className="text-xs font-bold uppercase text-[#4A443F] mb-4">Avisos Importantes do Sistema</h3>
                  <div className="space-y-3 text-xs leading-relaxed text-[#4A443F]">
                    <div className="p-3 bg-white border border-[#E2DED0] rounded-lg">
                      <strong className="text-[#C15E3F] block mb-1">Capacidade do Forno:</strong>
                      O forno de 195 litros comporta até 5 níveis de 10cm de altura ou 4 níveis de 15cm. Monitore o espaçamento de segurança de 2 cm nas prateleiras esmaltadas.
                    </div>
                    <div className="p-3 bg-white border border-[#E2DED0] rounded-lg">
                      <strong className="text-[#C15E3F] block mb-1">Responsabilidade Técnica:</strong>
                      Peças reagentes geram risco de escoamento. Verifique sempre se o pé da peça foi completamente limpo de esmalte antes do carregamento.
                    </div>
                  </div>
                </div>
              </div>

              {/* Orders List for Admins */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <h3 className="text-base font-bold text-[#4A443F]">Fila Geral de Pedidos</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#8A847C]">Filtrar Status:</span>
                    <select 
                      value={adminFilterStatus}
                      onChange={(e) => setAdminFilterStatus(e.target.value)}
                      className="p-1.5 bg-white border border-[#E2DED0] rounded-lg text-xs"
                      id="select-admin-filter"
                    >
                      <option value="todos">Todos</option>
                      <option value="pendente">Aguardando Avaliação</option>
                      <option value="em_analise">Em Análise Técnica</option>
                      <option value="aprovado">Aprovados</option>
                      <option value="queimando">No Forno (Queima)</option>
                      <option value="concluido">Concluídos</option>
                      <option value="cancelado">Cancelados</option>
                    </select>
                  </div>
                </div>

                {filteredOrders.length === 0 ? (
                  <p className="text-center py-10 text-xs text-[#8A847C] border border-[#E2DED0] rounded-xl bg-[#F9F8F6]">Nenhum pedido encontrado para o filtro selecionado.</p>
                ) : (
                  <div className="space-y-4">
                    {filteredOrders.map((order) => (
                      <div key={order.id} className="border border-[#E2DED0] rounded-xl p-4 bg-[#FDFDFD] shadow-sm">
                        <div className="flex flex-wrap justify-between items-center pb-2.5 border-b border-[#F2EFE9] mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#4A443F] text-xs sm:text-sm">Cliente: {order.clienteNome} ({order.clienteEmail})</span>
                              <span className="text-[10px] bg-[#F2EFE9] px-2 py-0.5 rounded text-[#8A847C] font-semibold">Pedido #{order.id}</span>
                            </div>
                            <span className="text-[10px] text-[#8A847C]">Data: {new Date(order.dataCriacao).toLocaleDateString('pt-BR')} às {new Date(order.dataCriacao).toLocaleTimeString('pt-BR')}</span>
                          </div>

                          <div className="flex items-center gap-3 mt-2 sm:mt-0">
                            <div className="text-right">
                              <span className="text-[11px] font-bold text-[#C15E3F] font-mono block">R$ {order.total.toFixed(2)}</span>
                            </div>
                            {/* Action to update status */}
                            <select 
                              value={order.status}
                              onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)}
                              className="p-1 border border-[#E2DED0] rounded text-xs bg-white font-semibold cursor-pointer"
                              id={`select-status-${order.id}`}
                            >
                              <option value="pendente">Aguardando Avaliação</option>
                              <option value="em_analise">Em Análise Técnica</option>
                              <option value="aprovado">Aprovado p/ Queima</option>
                              <option value="queimando">No Forno</option>
                              <option value="concluido">Concluído</option>
                              <option value="cancelado">Cancelado</option>
                            </select>
                          </div>
                        </div>

                        {/* Pieces details in admin view */}
                        <div className="space-y-2">
                          {order.pecas.map((p, idx) => (
                            <div key={idx} className="p-2 bg-[#F9F8F6] rounded border border-[#E2DED0] text-xs flex justify-between items-center">
                              <div>
                                <span className="font-bold text-[#4A443F]">{p.nome}</span>
                                <span className="ml-1.5 text-[9px] px-1.5 py-0.2 bg-[#E2DED0] rounded uppercase font-bold text-[#4A443F]">
                                  {p.tipo}
                                </span>
                                <span className="ml-2 text-[#8A847C]">
                                  {p.altura}x{p.largura}x{p.profundidade}cm • Modalidade: {p.metodo.replace('_', ' ')}
                                </span>
                              </div>
                              {p.detalhesTecnicos && (
                                <span className="text-[10px] text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded">
                                  Argila: {p.detalhesTecnicos.marcaMassa} • {p.detalhesTecnicos.tempMaximaQueima}ºC
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Authentication Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-[#E2DED0] shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-bold text-[#4A443F]">
                {authMode === 'login' ? 'Acessar Conta' : 'Criar Nova Conta'}
              </h3>
              <p className="text-xs text-[#8A847C] mt-1">
                {authMode === 'login' 
                  ? 'Faça login para salvar seus orçamentos cerâmicos na nuvem.' 
                  : 'Registre-se para iniciar seu monitoramento profissional de queimas.'}
              </p>
            </div>

            {authError && (
              <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg font-semibold">{authError}</p>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3">
              {authMode === 'register' && (
                <div>
                  <label className="text-[10px] font-bold uppercase text-[#8A847C] block mb-1">Nome Completo</label>
                  <input 
                    type="text" 
                    value={authNome}
                    onChange={(e) => setAuthNome(e.target.value)}
                    required
                    className="w-full p-2 border border-[#E2DED0] rounded-xl text-xs outline-none focus:border-[#C15E3F]"
                    id="auth-nome"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold uppercase text-[#8A847C] block mb-1">Endereço de E-mail</label>
                <input 
                  type="email" 
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                  placeholder="ex: ceramista@email.com"
                  className="w-full p-2 border border-[#E2DED0] rounded-xl text-xs outline-none focus:border-[#C15E3F]"
                  id="auth-email"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-[#8A847C] block mb-1">Senha de Acesso</label>
                <input 
                  type="password" 
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full p-2 border border-[#E2DED0] rounded-xl text-xs outline-none focus:border-[#C15E3F]"
                  id="auth-password"
                />
              </div>

              <button 
                type="submit"
                className="w-full py-2.5 bg-[#C15E3F] text-white rounded-xl text-xs font-bold shadow-md hover:bg-[#a64e32] transition-colors cursor-pointer"
                id="auth-submit"
              >
                {authMode === 'login' ? 'Entrar' : 'Cadastrar'}
              </button>
            </form>

            <div className="text-center pt-2">
              <button 
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                className="text-xs text-[#C15E3F] hover:underline font-semibold cursor-pointer"
                id="auth-toggle-mode"
              >
                {authMode === 'login' ? 'Não tem conta? Cadastre-se aqui' : 'Já possui conta? Faça login'}
              </button>
            </div>


          </div>
        </div>
      )}

      {/* Bottom Status Bar matching the Geometric Balance Theme */}
      <footer className="h-10 bg-[#4A443F] text-white text-[10px] flex items-center justify-between px-4 sm:px-8 uppercase tracking-[0.2em] shrink-0">
        <div className="flex gap-4">
          <span>Ollaria Ateliê</span>
        </div>
        <div className="flex gap-4 items-center">
          <span>v2.4.0 • Cloud Synced</span>
          <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse"></div>
        </div>
      </footer>
    </div>
  );
}
