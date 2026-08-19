export type QuoteStatus =
  | 'Rascunho'
  | 'Aguardando aprovação'
  | 'Aprovado'
  | 'Cancelado'
  | 'Expirado';

export interface Company {
  id: string;
  name: string;
  legal_name: string;
  cnpj: string;
  email: string;
  phone: string;
  whatsapp: string;
  logo_url: string;
}

export interface QuoteItem {
  id_interno: string;
  item_code: string;
  description: string;
  requested_qty: number;
  unit_price: number;
  total_price: number;
}

export interface Quote {
  id_interno: string;
  quote_number: string;
  created_at: string;
  expires_at: string;
  status: QuoteStatus;
  company_id: string;
  client_name: string;
  client_cep: string;
  client_address: string;
  client_number: string;
  client_complement: string;
  client_neighborhood: string;
  client_city: string;
  client_state: string;
  user_name: string;
  payment_method: string;
  notes: string;
  availability_notes: string;
  subtotal: number;
  discount: number;
  freight: number;
  total: number;
  items: QuoteItem[];
}
