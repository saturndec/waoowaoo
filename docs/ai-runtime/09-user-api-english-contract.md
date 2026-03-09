# 09 User API English Contract (VAT-29..34)

## Scope

This contract applies to user-facing backend APIs in `/api/user/*` that power config and provider connection flows.

- `POST /api/user/api-config/test-connection`
- `POST /api/user/api-config/fetch-models`

## Response contract

### Success

```json
{
  "success": true,
  "...": "route-specific fields"
}
```

### Error (stable envelope)

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
      "code": "FETCH_MODELS_BASE_URL_REQUIRED",
      "field": "baseUrl"
    }
  },
  "code": "INVALID_PARAMS",
  "message": "baseUrl is required"
}
```

## English-contract-first rule

1. API contract fields (`error.code`, `error.messageKey`, `error.defaultMessage`, `error.message`, top-level `message`, `details.code`, `details.field`) MUST be stable English values.
2. UI localization remains independent and should rely on `error.code`/`userMessageKey` for translated display.
3. No locale-dependent API message text.

## Error detail enum (current)

### test-connection

- `CONNECTION_PROVIDER_REQUIRED`
- `CONNECTION_PROVIDER_UNSUPPORTED`
- `CONNECTION_API_KEY_REQUIRED`
- `CONNECTION_BASE_URL_REQUIRED`
- `CONNECTION_EXTRA_HEADERS_JSON_INVALID`
- `CONNECTION_EXTRA_HEADERS_TYPE_INVALID`
- `CONNECTION_EXTRA_HEADER_VALUE_INVALID`
- `CONNECTION_GOOGLE_AUTH_FAILED`

### fetch-models

- `FETCH_MODELS_PROVIDER_UNSUPPORTED`
- `FETCH_MODELS_BASE_URL_REQUIRED`

## Validation / stability tests

- Unit:
  - `tests/unit/user-api/llm-test-connection.test.ts`
  - `tests/unit/user-api/provider-models.test.ts`
- API-specific integration:
  - `tests/integration/api/specific/user-api-contract-error-shape.test.ts`

These tests verify:

- Stable error envelope shape
- English message contract
- Error detail code/field compliance
- Presence of `requestId`
