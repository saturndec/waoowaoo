# 10 Message catalog & API contract normalization (VAT-47..52)

## Policy

This lane follows **English-contract-first + adaptive prompt language**:

- Backend/API contract fields stay stable in English (`code`, `messageKey`, `defaultMessage`, `message`).
- UI rendering remains locale-driven (i18n by key), independent from backend display text.
- Prompt language can be adaptive by model/provider/task, but this document focuses on message contract layer.

## Scope (P1)

- Normalize API error envelope to include stable fields:
  - `error.code`
  - `error.messageKey`
  - `error.defaultMessage`
  - `error.message`
- Keep compatibility fields for existing consumers:
  - `error.userMessageKey` (alias of `messageKey`)
  - top-level `code` and `message`
- Keep FE adapter locale translation path, but ensure adapter can consume normalized fields.

## Message catalog schema (contract)

```ts
interface ErrorMessageContract {
  code: UnifiedErrorCode // UPPER_SNAKE_CASE
  messageKey: `errors.${UnifiedErrorCode}`
  defaultMessage: string // stable english fallback from catalog
  message: string // runtime english detail (may be more specific than defaultMessage)
}
```

### Naming conventions

- `code`: `^[A-Z][A-Z0-9_]*$`
- `messageKey`: `^errors\.[A-Z][A-Z0-9_]*$`
- `defaultMessage`: catalog-defined English sentence
- `message`: runtime English detail (validation/provider-specific)

### Invalid examples

- `code: "invalid_params"`
- `messageKey: "Errors.INVALID_PARAMS"`
- `messageKey: "errors.invalid_params"`

## Endpoint contract migration note (P1 touched)

### Before

```json
{
  "success": false,
  "error": {
    "code": "INVALID_PARAMS",
    "message": "baseUrl is required",
    "userMessageKey": "errors.INVALID_PARAMS"
  },
  "code": "INVALID_PARAMS",
  "message": "baseUrl is required"
}
```

### After

```json
{
  "success": false,
  "requestId": "req_xxx",
  "error": {
    "code": "INVALID_PARAMS",
    "messageKey": "errors.INVALID_PARAMS",
    "defaultMessage": "Invalid parameters",
    "message": "baseUrl is required",
    "retryable": false,
    "category": "VALIDATION",
    "userMessageKey": "errors.INVALID_PARAMS",
    "details": {
      "requestId": "req_xxx",
      "code": "FETCH_MODELS_BASE_URL_REQUIRED"
    }
  },
  "code": "INVALID_PARAMS",
  "message": "baseUrl is required"
}
```

### Backward compatibility

- Existing consumers reading `error.userMessageKey`, top-level `code/message` continue working.
- New consumers should prefer:
  - `error.messageKey` for locale translation lookup
  - `error.defaultMessage` as stable fallback
  - `error.code` for logic branching

## FE adapter compatibility

- FE error extraction (`resolveTaskErrorSummary`, mutation request error) now preserves:
  - `code`
  - `messageKey`
  - `defaultMessage`
- Display path remains locale translation first when available; raw `message` stays fallback for precise diagnostics.

## Tests

- Unit contract schema/naming tests:
  - `tests/unit/errors/contract.test.ts`
- API envelope stability tests:
  - `tests/integration/api/specific/user-api-contract-error-shape.test.ts`
- FE adapter compatibility tests:
  - `tests/unit/query/mutation-shared.test.ts`
- Task error summary contract propagation tests:
  - `tests/unit/task/error-message.test.ts`

## Non-goals (P1)

- No prompt-language routing changes here (belongs to P2 lane).
- No production deployment changes.
- No translation content rewrite; only contract normalization and adapter compatibility.
