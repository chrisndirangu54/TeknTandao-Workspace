# Inventory Agent: replenishment planning

The Inventory Agent extends existing `warehouseStock`, `products`, procurement and Automation Studio infrastructure. It never sends supplier messages, submits a purchase order or modifies physical stock.

## Backend
- `saveInventoryAgentReorderPolicy`: inventory + procurement owner sets per warehouse/SKU `dailyDemand`, `leadDays`, `safetyStock`, `reserved`, `onOrder`, optional `unitCostMinor` and `supplierId`. The warehouse stock document must exist. Counts are integral units; costs are KES minor units.
- `getInventoryAgentRecommendations`: CRM-style cursor page over up to 100 warehouse stock records. Computes `inventoryPosition = onHand - reserved + onOrder`, `reorderPoint = dailyDemand × leadDays + safetyStock`, and `recommendedQuantity = max(0, reorderPoint - inventoryPosition)`. Missing policies produce warnings, never fabricated reorder quantities.
- `explainInventoryAgentRecommendations`: responds to a natural language inventory question using Gemini and server-derived, minimized SKU/warehouse inventory signals. No vendor contacts or private procurement notes are sent. Requires `GEMINI_MODEL` and `GEMINI_API_KEY`.
- `draftInventoryPurchaseRecommendation`: authorized inventory/procurement owner can create an idempotent draft identified by caller supplied `draftId`. The server recomputes quantity in a Firestore transaction. Draft status is `awaiting_procurement_approval`, not an actual purchase order.

## Dashboard
`Inventory & Warehouses` → sparkle icon → Inventory Agent. Load recommendation pages, ask for an explanation, and review a draft before saving. Existing procurement purchase-order controls remain separate.

## Tool-driven orchestration
The existing `draftAgentWorkflowFromPrompt` can plan additional approved tool integrations using connected services. No unapproved connector action is invoked by the Inventory Agent.

## Production limitations
These are forecasts only when daily demand, lead times, reservations, on-order stock and costs have been maintained accurately; model input is not a proven demand forecast. Ensure stock quantities are in common units. Demand policy changes, stock updates and draft decisions should be revalidated at actual purchase-order approval. Add supplier master-data checks, multi-supplier comparison, budgets, delivery constraints and purchase-order conversion with a separate approval gate.

Run `npm test`, `flutter analyze`, emulator tenancy/Firestore tests and CI before deployment. Gemini quota/rate limiting, complete inventory-history forecasting and large-scale streaming reports remain to be implemented. No live purchasing has been tested or enabled.
