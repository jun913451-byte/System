# Use a Thin Backend for the Browser Demo

The demo will use a Vue browser frontend with a small backend and SQLite. The backend owns simulated user/platform data and calls DeepSeek so its API key is not exposed to the browser; full chat transcripts are not persisted. This keeps the demo simple while supporting the agreed data boundaries and later browser deployment.
