# ERP System Workflows

## 1. Entity Creation Dependencies

This diagram shows what must be created before other entities can be created.

```mermaid
flowchart TD
    subgraph "Tier 0: Base Entities (No Dependencies)"
        CUSTOMER[Customer]
        SUPPLIER[Supplier]
        MATERIAL[Material]
    end

    subgraph "Tier 1: Product Setup"
        PRODUCT[Product]
        AML[Approved Manufacturer]
    end

    subgraph "Tier 2: BOM Structure"
        BOM_REV[BOM Revision]
        BOM_ITEM[BOM Item]
    end

    subgraph "Tier 3: Purchasing"
        PO[Purchase Order]
        PO_LINE[PO Line]
    end

    subgraph "Tier 4: Receiving"
        RECV_INSP[Receiving Inspection]
        INV_LOT[Inventory Lot]
    end

    subgraph "Tier 5: Orders"
        ORDER[Order]
        ALLOCATION[Inventory Allocation]
    end

    %% Dependencies
    CUSTOMER --> PRODUCT
    PRODUCT --> BOM_REV
    MATERIAL --> BOM_ITEM
    BOM_REV --> BOM_ITEM
    MATERIAL --> AML
    SUPPLIER --> AML

    SUPPLIER --> PO
    MATERIAL --> PO_LINE
    PO --> PO_LINE

    PO_LINE --> RECV_INSP
    MATERIAL --> INV_LOT
    RECV_INSP -.->|creates| INV_LOT

    CUSTOMER --> ORDER
    PRODUCT --> ORDER
    BOM_REV --> ORDER
    MATERIAL --> ALLOCATION
    ORDER --> ALLOCATION
```

## 2. Complete System Setup Sequence

This shows the order in which you must set up the system before creating orders.

```mermaid
sequenceDiagram
    participant Admin
    participant System

    Note over Admin,System: PHASE 1: Master Data Setup

    Admin->>System: 1. Create Customer
    System-->>Admin: Customer created

    Admin->>System: 2. Create Supplier(s)
    System-->>Admin: Suppliers created

    Admin->>System: 3. Create Materials (components)
    System-->>Admin: Materials created

    Admin->>System: 4. Create Product (for Customer)
    System-->>Admin: Product created

    Note over Admin,System: PHASE 2: BOM Setup

    Admin->>System: 5. Create BOM Revision (for Product)
    System-->>Admin: BOM Revision created

    Admin->>System: 6. Add BOM Items (Materials to BOM)
    System-->>Admin: BOM Items added

    Admin->>System: 7. Set BOM as Active
    System-->>Admin: Product has active BOM

    Note over Admin,System: PHASE 3: Optional - AML Setup

    Admin->>System: 8. Add Approved Manufacturers for Materials
    System-->>Admin: AML entries created

    Note over Admin,System: System Ready for Orders!
```

## 3. Complete Order-to-Shipment Workflow

```mermaid
flowchart TD
    subgraph "1. ORDER CREATION"
        A[Create Order] --> B{Has Active BOM?}
        B -->|Yes| C[Order Created - ENTERED]
        B -->|No| D[Error: Need BOM]
    end

    subgraph "2. MATERIAL SOURCING"
        C --> E{Check Inventory}
        E -->|Sufficient| G[Ready to Allocate]
        E -->|Shortage| F[Create Purchase Orders]
        F --> F1[PO: DRAFT]
        F1 --> F2[PO: SUBMITTED]
        F2 --> F3[PO: CONFIRMED]
        F3 --> F4[Receive Materials]
        F4 --> F5[Inspection: PENDING]
        F5 --> F6[Inspection: APPROVED]
        F6 --> F7[Inventory Lot Created]
        F7 --> G
    end

    subgraph "3. ALLOCATION & KITTING"
        G --> H[Allocate Materials for Order]
        H --> I[Allocations: ACTIVE]
        I --> J[Pick Materials]
        J --> K[Allocations: PICKED]
        K --> L[Issue to Production]
        L --> M[Allocations: ISSUED]
    end

    subgraph "4. PRODUCTION"
        M --> N[Start Production]
        N --> O[KITTING Stage]
        O --> P{Production Type?}
        P -->|SMT_ONLY| Q[SMT Stage]
        P -->|TH_ONLY| R[TH Stage]
        P -->|SMT_AND_TH| Q
        Q --> R
        R --> S[COMPLETED]
    end

    subgraph "5. RECONCILIATION"
        S --> T[Return Materials from Production]
        T --> U{Material Outcome}
        U -->|Consumed| V[CONSUMED - Create Transaction]
        U -->|Returned| W[RETURNED - Back to Warehouse]
        U -->|Floor Stock| X[FLOOR_STOCK - Stay on Floor]
        U -->|Waste| Y[SCRAP Transaction]
    end

    subgraph "6. SHIPMENT"
        V --> Z[Ship Completed Units]
        W --> Z
        X --> Z
        Z --> AA[Order: SHIPPED]
    end
```

## 4. Purchase Order Workflow

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Create PO

    DRAFT --> SUBMITTED: Submit PO
    DRAFT --> CANCELLED: Cancel

    SUBMITTED --> CONFIRMED: Confirm PO
    SUBMITTED --> CANCELLED: Cancel

    CONFIRMED --> PARTIALLY_RECEIVED: Partial Receipt
    CONFIRMED --> RECEIVED: Full Receipt
    CONFIRMED --> CANCELLED: Cancel (if no receipts)

    PARTIALLY_RECEIVED --> PARTIALLY_RECEIVED: More Receipts
    PARTIALLY_RECEIVED --> RECEIVED: Final Receipt

    RECEIVED --> CLOSED: Close PO

    CLOSED --> [*]
    CANCELLED --> [*]

    note right of CONFIRMED
        Counts toward
        quantity_on_order
        in MRP
    end note

    note right of PARTIALLY_RECEIVED
        Creates Receiving
        Inspections for
        each receipt
    end note
```

## 5. Receiving & Inspection Workflow

```mermaid
flowchart TD
    subgraph "RECEIVE"
        A[PO Line Received] --> B[Create Receiving Inspection]
        B --> C[Status: PENDING]
        C --> D[Record: IPN, MPN, Manufacturer, Qty]
    end

    subgraph "INSPECT"
        D --> E[Start Inspection]
        E --> F[Status: IN_PROGRESS]
        F --> G{Validate IPN}
        G -->|Match| H{Validate MPN vs AML}
        G -->|No Match| I[Flag IPN Mismatch]
        I --> H
        H -->|On AML| J{Check Qty}
        H -->|Not on AML| K[Flag AML Issue]
        K --> J
        J --> L[Calculate Overall Result]
    end

    subgraph "DISPOSITION"
        L --> M{Disposition Decision}
        M -->|Accept| N[Status: APPROVED]
        M -->|Reject| O[Status: REJECTED]
        M -->|Hold| P[Status: ON_HOLD]

        N --> Q[Status: RELEASED]
        Q --> R[Create Inventory Transaction]
        R --> S[Create/Update Inventory Lot]
        S --> T[Material in RAW Bucket]

        O --> U[Return to Supplier]
        P --> V[Quarantine - Await Decision]
        V --> M
    end
```

## 6. Inventory Allocation Lifecycle

```mermaid
stateDiagram-v2
    [*] --> ACTIVE: Allocate for Order

    ACTIVE --> PICKED: Pick Materials
    ACTIVE --> CANCELLED: Cancel Allocation

    PICKED --> ISSUED: Issue to Production
    PICKED --> CANCELLED: Cancel

    ISSUED --> CONSUMED: Material Used
    ISSUED --> RETURNED: Return Excess
    ISSUED --> FLOOR_STOCK: Leave on Floor

    CONSUMED --> [*]
    RETURNED --> [*]
    CANCELLED --> [*]

    FLOOR_STOCK --> RETURNED: Later Return

    note right of ACTIVE
        Reserved in warehouse
        Still in RAW bucket
    end note

    note right of ISSUED
        On production floor
        Moved to WIP bucket
    end note

    note right of FLOOR_STOCK
        Stays in WIP bucket
        Available for next job
    end note
```

## 7. Production Stage Flow

```mermaid
flowchart LR
    subgraph "Order Status"
        ENTERED --> KITTING
        KITTING --> SMT
        KITTING --> TH
        SMT --> TH
        TH --> SHIPPED
        SMT --> SHIPPED
    end

    subgraph "Unit Flow"
        NOT_STARTED[Not Started] --> KIT[In Kitting]
        KIT --> SMT_STAGE[In SMT]
        KIT --> TH_STAGE[In TH]
        SMT_STAGE --> TH_STAGE
        SMT_STAGE --> COMPLETED
        TH_STAGE --> COMPLETED
        COMPLETED --> SHIP[Shipped]
    end

    subgraph "Production Types"
        SMT_ONLY[SMT Only] -.-> |Kitting → SMT → Complete| DONE1[Done]
        TH_ONLY[TH Only] -.-> |Kitting → TH → Complete| DONE2[Done]
        SMT_TH[SMT and TH] -.-> |Kitting → SMT → TH → Complete| DONE3[Done]
    end
```

## 8. Material Return from Production

```mermaid
sequenceDiagram
    participant Prod as Production Floor
    participant Sys as System
    participant WH as Warehouse

    Note over Prod,WH: After Production Complete

    Prod->>Sys: Report material usage for Order

    loop For each ISSUED allocation
        Prod->>Sys: counted_qty, consumed_qty, waste_qty

        alt Fully Consumed
            Sys->>Sys: Create CONSUMPTION transaction
            Sys->>Sys: Allocation → CONSUMED
        else Has Excess to Return
            Sys->>WH: Return excess to warehouse
            Sys->>Sys: Create RETURN transaction (WIP → RAW)
            Sys->>Sys: Allocation → RETURNED
        else Leave as Floor Stock
            Sys->>Sys: Allocation → FLOOR_STOCK
            Note over Sys: Stays in WIP bucket
        end

        alt Has Waste
            Sys->>Sys: Create SCRAP transaction
        end
    end

    Sys-->>Prod: Return results with variances
```

## 9. MRP Shortage Analysis

```mermaid
flowchart TD
    A[Run MRP Analysis] --> B[Get All Active Orders]
    B --> C[For Each Order]

    C --> D[Get BOM Items]
    D --> E[Calculate Required Qty]
    E --> F[required = BOM_qty × order_qty + scrap]

    F --> G[Get Inventory Position]
    G --> H[on_hand from transactions]
    G --> I[allocated from allocations]
    G --> J[available = on_hand - allocated]
    G --> K[on_order from open POs]

    H --> L{Check Shortage}
    I --> L
    J --> L
    K --> L

    L --> M[shortage = required - available - on_order]

    M --> N{shortage > 0?}
    N -->|Yes| O[Add to Shortage Report]
    N -->|No| P[Material OK]

    O --> Q[Include affected orders]
    O --> R[Include resource types SMT/TH]
    O --> S[Include customer impact]

    C --> T[Next Order]
    T --> C
```

## 10. Cycle Count Workflow

```mermaid
stateDiagram-v2
    [*] --> PLANNED: Schedule Count

    PLANNED --> IN_PROGRESS: Start Counting
    PLANNED --> CANCELLED: Cancel

    IN_PROGRESS --> PENDING_REVIEW: Submit Counts
    IN_PROGRESS --> CANCELLED: Cancel

    PENDING_REVIEW --> APPROVED: Approve & Reconcile
    PENDING_REVIEW --> IN_PROGRESS: Recount Required

    APPROVED --> [*]
    CANCELLED --> [*]

    note right of IN_PROGRESS
        Record physical counts
        for each material/lot
    end note

    note right of APPROVED
        Creates ADJUSTMENT
        transactions for
        variances
    end note
```

## Quick Reference: What to Create First

| To Create This... | You Need These First |
|-------------------|---------------------|
| Product | Customer |
| BOM Revision | Product |
| BOM Item | BOM Revision + Material |
| Purchase Order | Supplier |
| PO Line | Purchase Order + Material |
| Order | Customer + Product + Active BOM |
| Allocation | Order + Material (with inventory) |
| Approved Manufacturer | Material + (optionally) Supplier |

## Quick Reference: Status Flows

| Entity | Status Flow |
|--------|-------------|
| **Order** | ENTERED → KITTING → SMT → TH → SHIPPED (or ON_HOLD/CANCELLED) |
| **Purchase Order** | DRAFT → SUBMITTED → CONFIRMED → PARTIALLY_RECEIVED → RECEIVED → CLOSED |
| **Receiving Inspection** | PENDING → IN_PROGRESS → APPROVED/REJECTED/ON_HOLD → RELEASED |
| **Allocation** | ACTIVE → PICKED → ISSUED → CONSUMED/RETURNED/FLOOR_STOCK |
| **Cycle Count** | PLANNED → IN_PROGRESS → PENDING_REVIEW → APPROVED |
