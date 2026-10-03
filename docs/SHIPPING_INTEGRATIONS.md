# Shipping integrations

Stores connect their own courier accounts at **Settings → Shipping & COD → Courier partners**.

| Capability | Shiprocket | Delhivery Express |
|---|---|---|
| Credentials | API user email + password (token cached per account, 9 days) | API token (`Authorization: Token …`), staging or production |
| Serviceability | `GET /courier/serviceability` | `GET /c/api/pin-codes/json/?filter_codes=` |
| Create shipment | `POST /orders/create/adhoc` + `POST /courier/assign/awb` | `POST /api/cmu/create.json` (`format=json&data=`) |
| Label | `POST /courier/generate/label` | `GET /api/p/packing_slip?wbns=&pdf=true` |
| Pickup | `POST /courier/generate/pickup` | Manifested with the warehouse (schedule in Delhivery One) |
| Tracking | `GET /courier/track/awb/{awb}` | `GET /api/v1/packages/json/?waybill=` |
| Cancel | `POST /orders/cancel` | `POST /api/p/edit` (`cancellation: true`) |

- `getShippingSetup(tenantId)` picks the store's default courier (`stores.integrations.default_courier`) if connected, else the first connected one, else manual fulfilment. The adapter interface (`features/shipping/types.ts`) makes adding couriers a matter of one file.
- **Order page:** "Book with {courier}" for confirmed, unshipped orders, then Refresh tracking, Get label, Request pickup and Cancel shipment. All require `orders.write` (tracking `orders.read`), are rate-limited and audited (pickup, cancel).
- Pickup location name and PIN come from the integration settings; weight comes from variant weights (500 g fallback).
- Credentials follow the same encryption and test-before-connect rules as payments. The platform-level `SHIPROCKET_EMAIL/PASSWORD` env vars were removed.
- COD rules: enable/disable, fee, min/max order and per-PIN-prefix `cod_allowed` rules are independent of the courier.
- Delhivery request and response mapping is unit-tested (`tests/unit/integrations/providers.test.ts`). Live calls are not verified here.
