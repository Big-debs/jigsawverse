// Kept explicit because the web app currently pins supabase-js below the
// version that exports synchronized Edge Function CORS headers.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': [
    'authorization',
    'x-client-info',
    'apikey',
    'content-type',
    'x-retry-count',
    'traceparent',
    'tracestate',
    'baggage'
  ].join(', '),
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

