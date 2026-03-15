**Spotlight:** Search and validate 74,000+ ICD-10-CM diagnosis codes from the CMS 2025 dataset. Lookup by code, keyword search, chapter browsing, and batch operations.

Search and look up ICD-10-CM diagnosis codes from the complete CMS 2025 dataset (74,000+ codes). Supports code lookup, keyword search, chapter browsing, batch operations, and code validation.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/lookup` | Look up a specific ICD-10 code |
| GET | `/search` | Search codes by keyword or description |
| GET | `/chapter/:chapter` | List all codes in a chapter (1-22) |
| GET | `/validate` | Check if a code exists in ICD-10-CM 2025 |
| POST | `/lookup/batch` | Look up multiple codes at once (max 50) |
| GET | `/data-info` | Data source info and build date |

### Quick Start

```javascript
const response = await fetch('https://icd-10-code-lookup.p.rapidapi.com/search?q=type+2+diabetes&limit=5', {
  headers: {
    'x-rapidapi-key': 'YOUR_API_KEY',
    'x-rapidapi-host': 'icd-10-code-lookup.p.rapidapi.com'
  }
});
const data = await response.json();
// { query: "type 2 diabetes", count: 5, results: [{ code: "E11.9", description: "Type 2 diabetes mellitus without complications" }, ...] }
```

### Rate Limits

| Plan | Requests/month | Rate |
|------|---------------|------|
| Basic (Pay Per Use) | Unlimited | 10/min |
| Pro ($9.99/mo) | 5,000 | 50/min |
| Ultra ($29.99/mo) | 25,000 | 200/min |
| Mega ($99.99/mo) | 100,000 | 500/min |
