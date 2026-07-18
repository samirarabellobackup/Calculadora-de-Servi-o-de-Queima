export type FiringType = 'biscoito' | 'esmalte' | 'monoqueima' | 'terceira_queima';

export type BiscoitoMethod = 'compartilhada' | 'meia_fornada' | 'fornada_inteira';
export type EsmalteMethod = 'reserva_prateleira' | 'meia_fornada' | 'fornada_inteira';

export interface PieceDimensions {
  altura: number;
  largura: number;
  profundidade: number;
}

export interface TechnicalDetails {
  nacionalidadeMassa: string;
  marcaMassa: string;
  tempMaximaQueima: number;
  // For esmalte:
  tipoEsmalte?: 'reagente' | 'estavel' | 'mate' | 'acetinado' | 'brilho' | '';
  marcaEsmalte?: string;
  tempMaximaEsmalte?: number;
  quantasCamadas?: number;
}

export interface PieceItem {
  id: string;
  nome: string;
  tipo: FiringType;
  metodo: BiscoitoMethod | EsmalteMethod;
  altura: number;
  largura: number;
  profundidade: number;
  volumeM3: number;
  custoCalculado: number;
  detalhesTecnicos?: TechnicalDetails;
  incluirDetalhes: boolean;
}

export interface Order {
  id: string;
  clienteId: string;
  clienteNome: string;
  clienteEmail: string;
  pecas: PieceItem[];
  total: number;
  status: 'pendente' | 'em_analise' | 'aprovado' | 'queimando' | 'concluido' | 'cancelado';
  dataCriacao: string;
  dataAtualizacao: string;
  metodoEnvio: 'pdf' | 'whatsapp' | 'ambos';
  comprovanteEnvioUrl?: string;
}

export interface User {
  id: string;
  nome: string;
  email: string;
  isAdmin: boolean;
  token?: string;
}

export interface NotificationItem {
  id: string;
  orderId: string;
  titulo: string;
  mensagem: string;
  data: string;
  lida: boolean;
}
