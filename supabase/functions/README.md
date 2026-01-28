# Supabase Edge Functions

This directory contains Supabase Edge Functions for the PolyCopy application.

## Available Functions

### `get-polyscore`
Calculates PolyScore for live trades using Google BigQuery ML models.

See [get-polyscore/README.md](./get-polyscore/README.md) for detailed documentation.

## Development Setup

1. **Install Supabase CLI**:
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```

3. **Link your project**:
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. **Set environment variables**:
   ```bash
   supabase secrets set KEY=value
   ```

5. **Serve functions locally**:
   ```bash
   supabase functions serve
   ```

## Deployment

Deploy all functions:
```bash
supabase functions deploy
```

Deploy a specific function:
```bash
supabase functions deploy get-polyscore
```

## Shared Utilities

The `_shared/` directory contains utilities shared across multiple functions:
- `cors.ts`: CORS headers configuration
