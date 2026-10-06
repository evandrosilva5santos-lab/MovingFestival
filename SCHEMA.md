# SCHEMA & CONTRATOS DE DADOS - Plataforma de Vendas Moving Festival 2026

## 1. Modelo de Dados Unificado (Ticket Record)

```typescript
export type PlatformSource = 'UTICKET' | 'SYMPLA' | 'WIX';

export type SectorType = 'FULLPASS' | 'ZONE' | 'GOLD' | 'BLACK';

export type TicketCategory = 'PAID' | 'COURTESY';

export interface TicketItem {
  id: string;               // Código do ingresso ou identificador único
  platform: PlatformSource; // Origem
  sector: SectorType;       // Setor oficial padronizado
  originalLotName: string;  // Nome bruto do lote na ticketeira
  buyerName?: string;       // Nome do participante/comprador
  buyerEmail?: string;      // E-mail
  buyerPhone?: string;      // Celular / WhatsApp
  price: number;            // Valor pago em R$ (0 para cortesia)
  category: TicketCategory; // PAID (vendido) ou COURTESY
  status: 'CONFIRMED' | 'CANCELLED';
  purchasedAt?: string;     // ISO timestamp
}
```

---

## 2. Modelo de Agregação Executiva (Sales Summary)

```typescript
export interface SectorSummary {
  sector: SectorType;
  paidCount: number;
  courtesyCount: number;
  totalCount: number;
  breakdownByPlatform: {
    sympla: number;
    uticket: number;
    wix: number;
  };
  breakdownByLot: Record<string, number>;
}

export interface GlobalSalesSummary {
  updatedAt: string;
  totalPaid: number;
  totalCourtesy: number;
  grandTotal: number;
  sectors: {
    FULLPASS: SectorSummary;
    ZONE: SectorSummary;
    GOLD: SectorSummary;
    BLACK: SectorSummary;
  };
  platforms: {
    sympla: number;
    uticket: number;
    wix: number;
  };
}
```

---

## 3. Invariantes de Negócio & Regras de Exclusão
* Itens cujo nome contenha `CAMPING` são estritamente excluídos do total de ingressos.
* Itens cujo nome seja exclusivamente `COPO` ou `COPO MOVING 2026` são estritamente excluídos.
* Itens promocionais com ingresso embutido (ex: `PRÉ VENDA LOTE 2 + COPO`) são atribuídos ao setor de origem do ingresso.
